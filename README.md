# Welcome to Remix!

## Production releases

Use [RELEASE_GUIDE.md](./RELEASE_GUIDE.md) as the canonical step-by-step procedure for Fanal API, Main, Owner, and coordinated platform releases. It covers patch, minor, and major version selection, immutable candidate deployment, verification, promotion, component publication, feature rollout, and rollback.

- 📖 [Remix docs](https://remix.run/docs)

## Development

Run the dev server:

```shellscript
npm run dev
```

## Read-only Release Center

The Owner route `/releases` lists trusted component metadata artifacts from successful API, Main, and Owner builds. Phase 2 is intentionally read-only and does not dispatch deployment operations.

Configure a GitHub App with **Metadata: read** and **Actions: read** access to `noblelar/fanalAPI`, `noblelar/fanal_main`, and `noblelar/fanal_owner`. Mount its PEM private key as a server-side secret file, then configure:

```text
GITHUB_CATALOG_APP_ID
GITHUB_CATALOG_INSTALLATION_ID
GITHUB_CATALOG_PRIVATE_KEY_FILE
```

Optional catalog controls are `GITHUB_CATALOG_CACHE_SECONDS` (15–300 seconds) and `GITHUB_CATALOG_MAX_CANDIDATES` (1–20 builds per component). The private key is never returned to the browser.

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
