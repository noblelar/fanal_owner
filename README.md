# Welcome to Remix!

- 📖 [Remix docs](https://remix.run/docs)

## Development

Run the dev server:

```shellscript
npm run dev
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
