# Welcome to Remix!

## Production releases

Use [RELEASE_GUIDE.md](./RELEASE_GUIDE.md) as the canonical step-by-step procedure for Fanal API, Main, Owner, and coordinated platform releases. It covers patch, minor, and major version selection, immutable candidate deployment, verification, promotion, component publication, feature rollout, and rollback.

- 📖 [Remix docs](https://remix.run/docs)

## Development

Run the dev server:

```shellscript
npm run dev
```

## Release Center candidate lifecycle

The Owner route `/releases` lists trusted component metadata artifacts from successful API, Main, and Owner builds. The catalog correlates evidence through each successful workflow run, downloads the run's exact ZIP through GitHub's short-lived artifact redirect, and keeps download, expiry, and metadata-validation failures distinct. Phase 5 can combine trusted artifacts with unchanged stable components, enforce Semantic Version progression, generate a deterministic manifest, and operate the complete `deploy-candidate` → `verify-candidate` → `promote-candidate` lifecycle through the protected GitHub workflow.

Dispatch is restricted to `PLATFORM_OWNER`, protected by a session-bound CSRF token and explicit confirmation, and revalidated from fresh artifact evidence on the server. Verification and promotion automatically reuse the exact deployed manifest, so the browser never submits raw image, version, or revision values. `PLATFORM_ADMIN` remains view-only. The GitHub `platform_release_env` required-reviewer gate remains mandatory after every request is queued.

Configure a GitHub App with **Metadata: read** and **Actions: read and write** access to `noblelar/fanalAPI`, `noblelar/fanal_main`, and `noblelar/fanal_owner`. Approve the permission change on the existing App installation, mount its PEM private key as a server-side secret file, then configure:

```text
GITHUB_CATALOG_APP_ID
GITHUB_CATALOG_INSTALLATION_ID
GITHUB_CATALOG_PRIVATE_KEY_FILE
GITHUB_CATALOG_DISPATCH_ENABLED=false
```

Keep `GITHUB_CATALOG_DISPATCH_ENABLED=false` until the production SSM target, protected environment, and deployment scripts have been verified. Change it to `true` only to activate dispatch. Optional catalog controls are `GITHUB_CATALOG_CACHE_SECONDS` (15–300 seconds), `GITHUB_CATALOG_MAX_CANDIDATES` (1–20 builds per component), and `GITHUB_CATALOG_MAX_RUNS_SCANNED` (10–50 recent successful runs per component; default 20). The private key and generated workflow inputs are never returned for browser editing.

Catalog failures are logged server-side as `release_catalog_failure` with a safe category, repository, workflow run ID, and artifact ID or name when known. Tokens, authorization headers, private keys, and signed artifact URLs are never logged. The Release Center also distinguishes workflow-artifact lookup failures, download failures, expired artifacts, and rejected metadata instead of reporting all exclusions as validation errors.

Run the catalog contract tests with:

```shellscript
npm run test:component-release-metadata
npm run test:release-catalog
```

## Documentation regression tests

Run the Owner documentation state and route-action tests:

```shellscript
npm run test:documentation
```

Run the isolated browser workflow suite. It starts the real Remix Owner app and a disposable in-memory platform API, so it does not require or modify a local database:

```shellscript
npm run test:documentation:e2e
```

On Windows the suite uses the installed Microsoft Edge browser. On other development or CI environments, install Playwright Chromium once with `npx playwright install chromium`.

## Deployment

First, build your app for production:

```sh
npm run build
```

Then run the app in production mode:

```sh
npm start
```

Now you'll need to pick a host to deploy it to.

### DIY

If you're familiar with deploying Node applications, the built-in Remix app server is production-ready.

Make sure to deploy the output of `npm run build`

- `build/server`
- `build/client`

## Styling

This template comes with [Tailwind CSS](https://tailwindcss.com/) already configured for a simple default starting experience. You can use whatever css framework you prefer. See the [Vite docs on css](https://vitejs.dev/guide/features.html#css) for more information.
