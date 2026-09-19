# Releasing Fanal Owner

Coordinated API/Main/Owner candidate deployment and platform promotion are documented in `PLATFORM_RELEASING.md`. This document continues to define the independent Owner component version and stable component release.

## Version source

The root `package.json` is the authoritative source for the Owner application Semantic Version. The root entry in `package-lock.json`, Git tags, Docker labels, and release notes must match it.

## Version policy

- PATCH: backward-compatible bug, security, or performance fixes.
- MINOR: backward-compatible owner-console pages, workflows, and governance features.
- MAJOR: incompatible route, session, configuration, API requirement, or documented workflow changes.

## Build and release tags

Each successful `master` build publishes the full-commit and `latest` tags plus an immutable `VERSION-sha.REVISION` tag, for example `1.0.0-sha.abc123def456`.

The manually dispatched `.github/workflows/release.yml` workflow promotes the already-tested full-commit image to the bare stable version tag, for example `1.0.0`. It does not rebuild the image, change `latest`, or deploy to EC2. A stable version tag may never be moved to different image content.

## Deployment image selection

Production Compose resolves the Owner image from `FANAL_OWNER_IMAGE`. If the variable is unset or empty, it remains backward compatible by using `fanalarkgroup/fanal_owner:latest` for manual legacy operation.

The `master` build does not consume that fallback. It resolves and reports the registry-confirmed `docker.io/fanalarkgroup/fanal_owner@sha256:...` reference. Phase 6 leaves the former component-only deployment job disabled by default. The manually dispatched `Coordinate Fanal Platform Release` workflow validates and deploys the exact Owner, API, and Main digest combination as one candidate. The server verifies all three running images and endpoints and restores the previous coordinated combination if verification fails. `latest` continues to be published only as a temporary compatibility tag.

Do not create the repository variable `FANAL_LEGACY_COMPONENT_AUTO_DEPLOY` during normal operation. Setting it to `true` re-enables the old component-only deployment as a break-glass path and temporarily bypasses platform-manifest coordination.

The server must have the Phase 4 image-variable Compose configuration and the current `deploy-component.sh` installed before this workflow reaches `master`. Successful deployments record their exact image and rollback reference in `/home/ubuntu/fanal/deployments/owner.env`.

## Release preparation

1. Select the next version from the documented owner-console contract change.
2. Update `package.json` and synchronize both version fields in `package-lock.json` on a release-preparation branch.
3. Move relevant `CHANGELOG.md` entries from `Unreleased` into a non-empty `## [X.Y.Z] - YYYY-MM-DD` section.
4. Merge the reviewed preparation change into `master`.
5. Wait for the normal `master` quality gate and build to pass and publish the full-commit Docker tag.
6. Verify `GET /api/version` reports the expected version and source revision in the intended environment.
7. In GitHub Actions, run **Release Fanal Owner** from `master`, enter the exact `X.Y.Z` version, and select `confirm_release`.
8. Approve the dedicated `release_env` gate when prompted.

The release workflow validates all package versions, the dated changelog entry, Git tag, GitHub Release, source image, and destination image before publishing anything. It promotes the exact full-SHA image, creates annotated `vX.Y.Z`, and publishes the matching GitHub Release. If a partial run is retried, any existing tag or image must still resolve to the same commit and digest.

Create a dedicated `release_env` with a required reviewer and add `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` to it. Keeping this separate from `production_env` prevents release governance from changing the existing deployment pipeline. Protect `v*` tags from updates and deletion, and enable immutable GitHub Releases where repository policy supports it.

The `master` build deploys its own immutable build digest. Publishing a stable release still does not deploy it.
