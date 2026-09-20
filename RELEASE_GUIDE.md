# Fanal Release Guide

This is the canonical operating procedure for releasing Fanal API, Fanal Main, Fanal Owner, and a coordinated Fanal platform version. Follow it for every patch, minor, and major release.

The Owner repository coordinates production deployment. API, Main, and Owner retain independent Semantic Versions and immutable container images. A platform release records one tested combination of those three components.

## 1. Non-negotiable release rules

1. Use stable Semantic Versions in `MAJOR.MINOR.PATCH` form.
2. Version each component independently. Do not bump an unchanged component merely to make its version match the platform version.
3. Deploy only registry-confirmed image digest references. Never enter `latest`, a commit tag, or a version tag into a platform manifest.
4. Use full 40-character lowercase Git revisions. Never use the 12-character revision shown in an immutable version tag.
5. Build once and promote the same artifacts. Do not rebuild between candidate testing and promotion.
6. Deploy normal releases only through **Coordinate Fanal Platform Release** in Fanal Owner.
7. Keep `FANAL_LEGACY_COMPONENT_AUTO_DEPLOY` absent or set to anything other than `true`. It is a break-glass mechanism, not the normal pipeline.
8. Keep all new tenant-visible functionality fail-closed and begin at the `test` stage with Demo School only.
9. Never commit real school IDs, SMTP passwords, AWS credentials, Docker Hub tokens, `.env.prod`, protected cohort files, or local platform manifests.
10. Every API recreation must combine `docker-compose.prod.yml` and `docker-compose.smtp-secret.yml`.
11. Stable Docker tags, Git tags, and GitHub Releases are immutable. Never delete or move them to correct a release; publish a new version.
12. Freeze release-related merges from candidate deployment until component release workflows finish. The component release workflow publishes the image belonging to the current `master` commit.

## 2. Understand the four versions

| Version | Authoritative source | Container repository |
| --- | --- | --- |
| API | `fanalAPI/main/main.csproj` | `docker.io/fanalarkgroup/fanalapi` |
| Main | `fanal_main/package.json` and synchronized `package-lock.json` root entries | `docker.io/fanalarkgroup/fanal` |
| Owner | `fanal_owner/package.json` and synchronized `package-lock.json` root entries | `docker.io/fanalarkgroup/fanal_owner` |
| Platform | Input to the Owner platform workflow and resulting `deployments/platform.env` | No separate image |

The platform version describes the complete API/Main/Owner combination. It does not have to equal every component version.

The API application version is also independent of its URL contract version. `/api/v1` changes only when an incompatible HTTP contract requires a parallel `/api/v2`; it does not change for ordinary API patch or minor releases.

## 3. Choose the release type

Apply the highest level of change contained in the release.

### Patch: `X.Y.Z` to `X.Y.(Z+1)`

Use a patch for backward-compatible corrections, including:

- bug fixes;
- security fixes that preserve supported contracts;
- performance or reliability fixes;
- dependency updates without breaking behavior;
- internal refactoring without a public contract change.

Example: API `1.1.0` becomes `1.1.1`; unchanged Main remains `1.1.0`; unchanged Owner remains `1.0.0`; platform `1.1.0` becomes `1.1.1`.

### Minor: `X.Y.Z` to `X.(Y+1).0`

Use a minor release for backward-compatible capabilities, including:

- a new page or workspace;
- a new optional API endpoint or response field;
- a new optional environment setting;
- a new school-scoped feature rollout;
- a deprecation that does not yet remove existing behavior.

Example: API and Main `1.1.0` become `1.2.0`; unchanged Owner remains `1.0.0`; platform `1.1.0` becomes `1.2.0`.

### Major: `X.Y.Z` to `(X+1).0.0`

Use a major release for incompatible changes, including:

- removing or changing a supported route, endpoint, payload, or authentication contract;
- removing a supported environment variable or operational workflow;
- requiring Main or Owner to change before they can communicate with the API;
- intentionally ending database or configuration backward compatibility.

A major release requires a written migration and rollback plan before implementation. For an incompatible API contract, introduce `/api/v2` alongside `/api/v1` and migrate consumers before retiring v1. For database changes, use the expand/contract sequence in section 7.

## 4. Decide which components change

Before editing code, complete this worksheet outside source control:

```text
Release type: PATCH | MINOR | MAJOR
Platform version: X.Y.Z

API changed: yes | no
API current version:
API next version:

Main changed: yes | no
Main current version:
Main next version:

Owner changed: yes | no
Owner current version:
Owner next version:

Database migration: none | expand | backfill | contract
New feature key, if any:
Initial feature stage: off | test
Rollback owner:
Release approver:
```

Rules:

- Bump only components whose released behavior or packaged content changed.
- A coordinated platform deployment still needs image, version, and revision values for all three components.
- For an unchanged component, use the exact currently stable production values from `/home/ubuntu/fanal/deployments/platform.env`.
- If a documentation-only change does not need deployment, do not create a production candidate solely because `master` built another image.

## 5. Release prerequisites

### Local workstation

- Git Bash for repository and SSH commands.
- Node.js version compatible with each repository workflow.
- npm.
- .NET 8 SDK for API validation.
- Access to all three GitHub repositories.
- The EC2 SSH key stored securely and excluded from Git.

Expected local repository locations:

```text
~/Desktop/React/fanal/fanalAPI
~/Desktop/React/fanal/fanal_main
~/Desktop/React/fanal/fanal_owner
```

### GitHub environments

Confirm these protected environments exist and require the intended reviewer:

- API: `deployment_env` and `release_env`;
- Main: `production_env` and `release_env`;
- Owner: `production_env`, `platform_release_env`, and `release_env`.

The build/release environments require their existing Docker Hub credentials. `platform_release_env` requires:

```text
AWS_ROLE_ARN
AWS_REGION
EC2_INSTANCE_ID
```

The GitHub OIDC role must allow the SSM actions used by the workflow, including `ssm:SendCommand` and `ssm:GetCommandInvocation`.

### Production EC2

Before a release, run these read-only checks on EC2:

```bash
sudo systemctl is-active amazon-ssm-agent
sudo docker version
sudo docker compose version
df -h /

sudo test -x /home/ubuntu/fanal/scripts/deploy-component.sh
sudo test -x /home/ubuntu/fanal/scripts/deploy-platform-release.sh
sudo test -f /home/ubuntu/fanal/docker-compose.prod.yml
sudo test -f /home/ubuntu/fanal/docker-compose.smtp-secret.yml
sudo test -f /home/ubuntu/fanal/.env.prod

sudo docker compose \
  --env-file /home/ubuntu/fanal/.env.prod \
  -f /home/ubuntu/fanal/docker-compose.prod.yml \
  -f /home/ubuntu/fanal/docker-compose.smtp-secret.yml \
  config --quiet

sudo docker exec fanal_proxy nginx -t
```

Confirm the running API can see a non-empty password file without printing it:

```bash
sudo docker exec fanal_api sh -c '
  test -n "${SMTP_PASSWORD_FILE:-}" &&
  test -r "$SMTP_PASSWORD_FILE" &&
  test -s "$SMTP_PASSWORD_FILE" &&
  printf "SMTP password file: OK\n"
'
```

Stop the release if any prerequisite fails.

## 6. Prepare component versions and changelogs

Create a release-preparation branch in each changed repository. Start from a clean and current `master`:

```bash
git switch master
git pull --ff-only
git status --short
COMPONENT="api"
NEXT_VERSION="1.1.1"
git switch -c "release/${COMPONENT}-${NEXT_VERSION}"
```

Set `COMPONENT` and `NEXT_VERSION` for the repository being prepared. Resulting branch names include `release/api-1.1.1`, `release/main-1.2.0`, and `release/owner-2.0.0`.

### API

Edit only the `<Version>` value in:

```text
fanalAPI/main/main.csproj
```

Example:

```xml
<Version>1.1.1</Version>
```

Verify it:

```bash
grep -n '<Version>' main/main.csproj
```

### Main

From `fanal_main`, let npm synchronize `package.json` and the root lockfile entries:

```bash
NEXT_VERSION="1.2.0"
npm version "$NEXT_VERSION" --no-git-tag-version
```

Verify all three authoritative values:

```bash
node -p "require('./package.json').version"
node -p "require('./package-lock.json').version"
node -p "require('./package-lock.json').packages[''].version"
```

### Owner

From `fanal_owner`:

```bash
NEXT_VERSION="1.1.0"
npm version "$NEXT_VERSION" --no-git-tag-version
```

Verify it with the same three Node commands used for Main.

### Changelog requirement

Every changed component must have a non-empty dated section in its own `CHANGELOG.md`:

```markdown
## [Unreleased]

## [1.2.0] - YYYY-MM-DD

### Added

- Describe the user-visible capability.

### Fixed

- Describe the corrected behavior.
```

Use only the headings that apply. Do not modify previously released sections. The release workflow rejects an absent, undated, or empty version section.

## 7. Database and configuration compatibility

The Demo School and all production schools share one database. Tenant isolation is based on the authenticated immutable school ID, not a separate database.

Use expand/contract migrations:

1. **Expand:** add nullable columns, new tables, compatible indexes, or optional configuration.
2. Deploy code that works with both the old and expanded schema.
3. **Backfill:** migrate data separately, observably, and in restartable batches.
4. Confirm both old and new code paths no longer require the earlier form.
5. **Contract:** remove old columns or constraints only in a later release after rollback no longer depends on them.

Never combine a destructive schema change with the first deployment of code that requires it. A candidate must remain compatible with the immediately previous stable containers so coordinated rollback remains possible.

## 8. Run local validation

Run validation in every changed repository. A warning is not automatically a failure, but all command exit codes must be zero. Review new warnings introduced by the change.

### API validation

```bash
cd ~/Desktop/React/fanal/fanalAPI

dotnet restore main.Tests/main.Tests.csproj
dotnet build main.Tests/main.Tests.csproj \
  --no-restore \
  --configuration Release
dotnet test main.Tests/main.Tests.csproj \
  --no-build \
  --configuration Release
```

For email or rollout changes, do not replace the full suite with focused tests. Focused tests may be run first, but the full suite remains the release gate.

### Main validation

```bash
cd ~/Desktop/React/fanal/fanal_main

npm ci
npm run test:feature-rollout
npm run test:finance-workspace-rollout
npm run check:admin-workspaces-rollout
npm run check:admin-workspaces-legacy-retirement
npm run test:admin-workspaces
npm run test:academic-scope-ui
npm run test:finance
npm run typecheck
npm run build
```

The production build requires the existing protected environment values. Never add them to a committed file. If `npm ci` reports Windows `EPERM` for a Next.js SWC file, close running Next.js/Node processes and editors holding that binary, then rerun `npm ci`; do not bypass the clean install by ignoring its failure.

### Owner validation

```bash
cd ~/Desktop/React/fanal/fanal_owner

npm ci
npm run test:platform-release
npm run lint
npm run typecheck
npm run test:documentation
npm run test:documentation:e2e
npm run build
```

Install the Playwright browser first if the local environment does not already have it:

```bash
npx playwright install chromium
```

### Final diff inspection

In each changed repository:

```bash
git diff --check
git status --short
git diff --stat
```

Confirm that no `.env` file, key, password, protected school ID, generated manifest, database dump, or certificate is staged.

## 9. Commit, push, review, and merge

In each changed repository:

```bash
git add -p
git diff --cached --check
git diff --cached --stat
git commit -m "release: prepare <component> <version>"
git push -u origin "$(git branch --show-current)"
```

Replace the commit-message placeholders before running the command. `git add -p` lets you inspect each change before staging it; separately add any intentional new files with `git add -- path/to/new-file`.

Open and review a pull request. Merge to `master` only after:

- local validation passes;
- pull-request checks pass;
- version and changelog are correct;
- schema changes follow expand/contract;
- feature gates fail closed;
- required review is complete.

Merge dependent components in this order unless the compatibility plan explicitly says otherwise:

1. API;
2. Main;
3. Owner.

The order does not deploy them independently during normal operation because component auto-deployment is disabled. It merely publishes candidate images.

After merging, freeze additional release-related merges until candidate promotion and component release publication are complete.

## 10. Wait for component build workflows

Each merge to `master` starts that repository's build workflow. Confirm its quality gate and `build-push` job succeed.

The old `deploy` job should be skipped. That is expected while `FANAL_LEGACY_COMPONENT_AUTO_DEPLOY` is not `true`.

Open each successful workflow's **build-push summary** and copy these exact values into the release worksheet:

- `Application version`;
- `Production deployment reference`;
- the full commit from `Commit tag`.

Valid production references have these exact prefixes:

```text
docker.io/fanalarkgroup/fanalapi@sha256:<64 lowercase hexadecimal characters>
docker.io/fanalarkgroup/fanal@sha256:<64 lowercase hexadecimal characters>
docker.io/fanalarkgroup/fanal_owner@sha256:<64 lowercase hexadecimal characters>
```

GitHub may visually mask `fanalarkgroup` as `***`. Replace only that masked owner with the approved literal repository owner. Do not alter the repository name or digest.

The `Commit tag` ends in the full 40-character revision:

```text
docker.io/fanalarkgroup/fanal:<40-character-revision>
```

Do not copy the shortened revision from `VERSION-sha.ABC123...`. Do not use `Buildx output digest` when the summary provides the complete `Production deployment reference`.

### Values for unchanged components

Read the current stable platform state on EC2:

```bash
sudo cat /home/ubuntu/fanal/deployments/platform.env
```

Copy the unchanged component's `IMAGE`, `VERSION`, and `REVISION` fields exactly. Do not substitute `latest` or a newly built but untested image.

### Completed release worksheet

```text
platform_version: X.Y.Z

api_image: docker.io/fanalarkgroup/fanalapi@sha256:<64-hex-digest>
api_version: X.Y.Z
api_revision: <40-hex-git-revision>

main_image: docker.io/fanalarkgroup/fanal@sha256:<64-hex-digest>
main_version: X.Y.Z
main_revision: <40-hex-git-revision>

owner_image: docker.io/fanalarkgroup/fanal_owner@sha256:<64-hex-digest>
owner_version: X.Y.Z
owner_revision: <40-hex-git-revision>
```

Check every value twice. An image belongs in an `*_image` field; a Git commit belongs in an `*_revision` field.

## 11. Deploy the candidate

In Fanal Owner GitHub Actions:

1. Open **Coordinate Fanal Platform Release**.
2. Select **Run workflow**.
3. Select branch `master`.
4. Set `operation` to `deploy-candidate`.
5. Enter `platform_version`.
6. Enter all API, Main, and Owner image/version/revision values from the worksheet.
7. Set `confirm_operation` to `true`.
8. Run the workflow and approve `platform_release_env` when prompted.

The workflow validates the manifest, preserves it as a 90-day artifact, sends it through SSM, and waits for EC2. EC2 then:

1. records the previous platform combination;
2. deploys API, Main, then Owner under one lock;
3. uses immutable digests;
4. applies the SMTP Compose override;
5. reloads Nginx after component recreation;
6. verifies container image references, versions, revisions, state files, and version endpoints;
7. automatically restores already changed components if the transaction fails.

Do not continue if the workflow is anything other than successful. Read both SSM stdout and stderr from the failed step.

## 12. Validate the candidate

### Server identity and health

Run on EC2:

```bash
sudo cat /home/ubuntu/fanal/deployments/platform.env

for container in fanal_api fanal_web fanal_owner; do
  sudo docker inspect "$container" \
    --format 'container={{.Name}} configured={{.Config.Image}} version={{index .Config.Labels "org.opencontainers.image.version"}} revision={{index .Config.Labels "org.opencontainers.image.revision"}}'
done

curl -fsS http://127.0.0.1:6668/api/v1/health
printf '\n'
curl -fsS http://127.0.0.1:6668/api/v1/version
printf '\n'

sudo docker exec fanal_web node -e \
  'fetch("http://127.0.0.1:3000/api/version").then(r => r.text()).then(console.log)'

sudo docker exec fanal_owner node -e \
  'fetch("http://127.0.0.1:3001/api/version").then(r => r.text()).then(console.log)'

sudo docker exec fanal_proxy nginx -t
curl -fsSI https://fanaledu.com/
curl -fsSI https://rynaks.com/
```

Expected results:

- each configured image exactly matches the manifest digest;
- each version and revision exactly matches the worksheet;
- API health and version requests succeed;
- `fanaledu.com` returns a successful application response;
- `rynaks.com` returns its expected page or login redirect;
- Nginx validation succeeds.

### Email smoke test

Confirm the SMTP password-file mount again without revealing it:

```bash
sudo docker exec fanal_api sh -c '
  test -n "${SMTP_PASSWORD_FILE:-}" &&
  test -r "$SMTP_PASSWORD_FILE" &&
  test -s "$SMTP_PASSWORD_FILE" &&
  printf "SMTP password file: OK\n"
'
```

Trigger an approved test email, such as a password reset for a controlled account. Confirm delivery and inspect recent API logs without printing configuration secrets:

```bash
sudo docker logs --since 10m --tail 200 fanal_api
```

### Functional smoke test

At minimum, verify:

- authentication and logout;
- normal school dashboard navigation;
- API-backed page loading;
- the changed behavior;
- a user without the required role remains denied;
- another production school remains on the stable behavior.

Record pass/fail evidence without student data, credentials, access tokens, or school IDs.

## 13. Activate new features for Demo School only

Skip this section when the release contains no newly gated feature.

New tenant-visible features must use the same uppercase key in Main and API and begin fail-closed:

```text
FEATURE_ROLLOUTS__FEATURE_KEY__ENABLED=false
FEATURE_ROLLOUTS__FEATURE_KEY__RELEASE_APPROVED=false
FEATURE_ROLLOUTS__FEATURE_KEY__STAGE=off
FEATURE_ROLLOUTS__FEATURE_KEY__TEST_SCHOOL_IDS=
FEATURE_ROLLOUTS__FEATURE_KEY__PILOT_SCHOOL_IDS=
FEATURE_ROLLOUTS__FEATURE_KEY__PERCENTAGE=
```

Store the Demo School UUID only in the protected EC2 cohort file or `.env.prod`. Never place it in source control, workflow inputs, release artifacts, image labels, public variables, or logs.

For Finance Workspace V2:

```bash
sudo /home/ubuntu/fanal/scripts/configure-finance-workspace-rollout.sh status
sudo /home/ubuntu/fanal/scripts/configure-finance-workspace-rollout.sh test
```

That script must use both production Compose files and preserve the SMTP password-file mount. After activation, sign out and sign back in so a newly issued JWT contains the authenticated school ID.

Verify:

- Demo School receives the new feature;
- at least one non-demo school remains excluded;
- direct URL entry cannot bypass the gate;
- API-only requests cannot bypass the gate;
- logs report stages, reasons, and cohort counts without school IDs.

Finance emergency kill switch:

```bash
sudo /home/ubuntu/fanal/scripts/configure-finance-workspace-rollout.sh off
```

Progression beyond `test` is a separate decision: `off` → `test` → `pilot` → `percentage` → `general`. Never advance automatically merely because deployment succeeded.

## 14. Re-verify and promote the exact candidate

After candidate testing succeeds, run **Coordinate Fanal Platform Release** again with:

```text
operation: verify-candidate
confirm_operation: true
```

Enter exactly the same platform version and all nine component values. Do not copy newer build summaries.

After `verify-candidate` succeeds, run it a third time with:

```text
operation: promote-candidate
confirm_operation: true
```

Again, enter exactly the same values. Promotion is rejected if any artifact differs from the stored tested candidate. Promotion does not rebuild or replace containers; it records the verified combination as stable.

Confirm on EC2:

```bash
sudo cat /home/ubuntu/fanal/deployments/platform.env
```

Expected:

```text
PLATFORM_VERSION=<released-platform-version>
PLATFORM_STATUS=stable
```

## 15. Publish stable component releases

Platform promotion and component release publication are separate operations:

- Platform promotion records the tested production combination.
- Each component's **Release Fanal ...** workflow publishes its bare Docker version tag, annotated Git tag, and GitHub Release. It does not deploy.

For every component whose version changed:

1. Open that repository's GitHub Actions.
2. Select **Release Fanal API**, **Release Fanal Main**, or **Release Fanal Owner**.
3. Run it from `master`.
4. Enter the exact stable component version.
5. Set `confirm_release` to `true`.
6. Approve `release_env`.
7. Confirm the workflow reports `Production deployment changed: no`.

Do this before allowing another commit onto that component's `master`. The workflow uses the current `master` commit as the release source.

Confirm the following exist and identify the same commit and digest:

- Docker tag `X.Y.Z`;
- annotated Git tag `vX.Y.Z`;
- GitHub Release `vX.Y.Z`.

Do not run a component release workflow for an unchanged component whose version already has a stable release.

## 16. Close the release

Save a release record containing:

- platform version;
- each component version, full revision, and digest reference;
- links to the three build runs used;
- link to the platform manifest artifact;
- deploy, verify, and promote workflow run links;
- component release run links for changed components;
- approver;
- smoke-test results;
- rollout stage;
- rollback decision and any incident reference.

Do not include credentials, access tokens, SMTP passwords, real school IDs, student data, or private email content.

Unfreeze merges only after the release record is complete.

## 17. Rollback procedure

### Candidate rejection or production failure

In Fanal Owner, run **Coordinate Fanal Platform Release** from `master` with:

```text
operation: rollback-candidate
confirm_operation: true
```

Platform/component fields are not required for rollback. The server uses `deployments/platform-rollback.json`, restores all three previous component digests, verifies them, and records the platform as `rolled-back`.

Then repeat the server health, proxy, email, and functional smoke tests from section 12.

### Feature-only failure

Disable only the affected feature first when the platform itself is healthy. For Finance Workspace V2:

```bash
sudo /home/ubuntu/fanal/scripts/configure-finance-workspace-rollout.sh off
```

Then verify Demo School has returned to legacy behavior. A feature kill switch does not replace platform rollback when base functionality is unhealthy.

### After a stable release was published

Never move or delete the published `vX.Y.Z` tag, GitHub Release, or Docker `X.Y.Z` tag. Roll back production if necessary, then fix forward with a new patch version.

## 18. Failure diagnosis

### Platform manifest validation fails

Check for:

- image references accidentally entered into revision fields;
- shortened Git revisions;
- `latest` or `:X.Y.Z` tags instead of `@sha256:` digests;
- wrong repository names;
- masked `***` left in an image reference;
- invalid or prerelease platform SemVer.

### SSM command fails before deployment

Check:

- `EC2_INSTANCE_ID` belongs to the configured AWS region;
- the instance is running and SSM `PingStatus` is `Online`;
- the instance role includes `AmazonSSMManagedInstanceCore`;
- GitHub's OIDC role has the required SSM permissions;
- both server deployment scripts exist and are executable.

Use the SSM stdout and stderr printed by the workflow. A Node.js action deprecation warning is not itself a deployment failure.

### API reports missing SMTP credentials

The API accepts exactly `SMTP_PASSWORD` or `SMTP_PASSWORD_FILE`. Production must use the protected password file.

Confirm every API recreation combines:

```text
docker-compose.prod.yml
docker-compose.smtp-secret.yml
```

Do not respond by placing the SMTP password directly in `.env.prod`. Restore the override and secret mount, then recreate the API using its immutable deployed digest.

### Public site returns 502 after container recreation

Verify the application container first. If its internal endpoint works, validate and reload Nginx so it resolves the recreated container address:

```bash
sudo docker exec fanal_proxy nginx -t
sudo docker exec fanal_proxy nginx -s reload
```

The managed deployment scripts already perform this step. Treat a need for repeated manual reloads as a deployment-script defect.

### Public site returns 404

Inspect active Nginx configuration for duplicate `server_name` blocks and confirm only the intended configuration is loaded:

```bash
sudo docker exec fanal_proxy sh -c '
  for file in /etc/nginx/conf.d/*.conf; do
    echo "===== $file ====="
    grep -n "server_name" "$file" || true
  done
'
```

Validate before reloading. Do not delete configuration files until the exact duplicate has been identified and a recovery copy exists.

## 19. Emergency component-only deployment

Use this only when a documented incident requires one component to be deployed before a coordinated manifest can be prepared.

1. Obtain incident approval.
2. Temporarily set repository variable `FANAL_LEGACY_COMPONENT_AUTO_DEPLOY=true` only in the affected repository.
3. Merge/build the exact component.
4. Let its guarded deployment job use `deploy-component.sh`.
5. Verify production.
6. Remove or disable the repository variable immediately.
7. Prepare and deploy a new coordinated platform candidate containing the actual running combination.

A component-only deployment invalidates the previously tested platform combination. It is not complete until a new coordinated candidate is verified and promoted.

## 20. Compact release checklist

```text
[ ] Release type selected: patch, minor, or major
[ ] Changed components identified
[ ] Platform and component versions selected
[ ] Migration and rollback plan approved
[ ] Version sources updated only for changed components
[ ] Dated changelog sections added
[ ] Local validation passed
[ ] Secret/school-ID scan completed
[ ] Pull requests reviewed and merged
[ ] Master build summaries successful
[ ] Exact image digests and full revisions recorded
[ ] Unchanged component values copied from stable platform.env
[ ] deploy-candidate successful
[ ] Server identity and health verified
[ ] Email smoke test passed
[ ] Functional and authorization smoke tests passed
[ ] Demo School-only rollout verified, if applicable
[ ] verify-candidate successful with identical inputs
[ ] promote-candidate successful with identical inputs
[ ] platform.env reports stable
[ ] Changed component release workflows published
[ ] Release evidence recorded
[ ] Merge freeze lifted
```

When any required checkbox fails, stop. Diagnose, roll back if production is unhealthy, and resume with new immutable artifacts rather than editing or reusing a published release.
