# Deployment

Sunset Drift is a static site. The production build is a folder of HTML, CSS,
JavaScript, a manifest and generated image assets. There is no application
server, database, build tool or environment variable required at runtime.

## Local development

```bash
npm install     # optional: no runtime dependencies, but creates the lockfile
npm start       # http://localhost:5173
```

The dev server is `server.mjs`. It supports `GET`/`HEAD`, correct MIME types,
cache control, path-traversal protection and a configurable root:

```bash
PORT=5174 npm start
node server.mjs dist          # serve a production build
node server.mjs --root dist   # same thing
```

## Production build

```bash
npm run build
```

Output:

```text
dist/
├─ index.html
├─ styles.css
├─ manifest.webmanifest
├─ robots.txt
├─ sitemap.xml
├─ assets/
│  ├─ icon.svg
│  ├─ icon-192.png
│  ├─ icon-512.png
│  ├─ icon-180.png
│  └─ og-image.jpg
└─ js/
```

Preview the exact build locally:

```bash
npm run preview   # builds, then serves dist/ on port 5173
```

`dist/` is ignored by Git. Change the source, then rebuild.

## GitHub Pages

The repository includes `.github/workflows/deploy-pages.yml`, which builds and
publishes `dist/` whenever `main` is updated (or when run manually from the
Actions tab).

Expected URL: **https://ybenbrai.github.io/cars/**

One-time setup:

1. Push the repository to GitHub.
2. Open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Run the **Deploy to GitHub Pages** workflow, or push to `main`.
5. Wait for the deployment job, then open the URL above.

The workflow runs a preflight check first. Until Pages is enabled, it skips the
build and deploy jobs and prints a notice instead of failing. After enabling
Pages, re-run the workflow (or push to `main`) to publish the site.

Direct links:

- [Pages settings](https://github.com/ybenbrai/cars/settings/pages)
- [All workflows](https://github.com/ybenbrai/cars/actions)
- [Deploy to GitHub Pages workflow](https://github.com/ybenbrai/cars/actions/workflows/deploy-pages.yml)

After opening the workflow page, use **Run workflow → main → Run workflow**.
The Actions tab is only available in a desktop browser; it is not exposed in the
GitHub mobile app.

The workflow uses the official Pages actions and the `github-pages` environment.
If the repository is renamed or transferred, update the URLs in `index.html`,
`manifest.webmanifest`, `robots.txt`, `sitemap.xml`, `package.json` and the
README badges.

## Other static hosts

Any host that serves files over HTTPS works. Use:

- **Build command:** `npm run build`
- **Output/publish directory:** `dist`
- **Node version:** 20 (or 18+)

Examples:

### Netlify

```text
Build command: npm run build
Publish directory: dist
```

### Vercel

```text
Framework preset: Other
Build command: npm run build
Output directory: dist
```

### Cloudflare (Workers + Durable Object, free plan)

Cloudflare serves the prebuilt `dist/` folder as static assets and runs
`worker/index.js` for `/api/*` and `/.well-known/*`. Accounts, cloud saves,
the leaderboards, online multiplayer and the admin API all live in one SQLite
Durable Object. This fits the Workers free plan; no KV, D1 or paid add-on is
needed. Browser-only guests still work if a player chooses not to sign in.

To enable the admin dashboard at `/admin`, add a secret in the Workers project
(**Settings → Variables and Secrets → Add variable → Secret**):

```text
Name: ADMIN_TOKEN
Value: a random string of at least 16 characters
```

Alternatively, set it locally with `npx wrangler secret put ADMIN_TOKEN`.
Without that secret, `/admin` stays switched off and returns a setup message.
With it, sign in using the same token and use **USERS → player → CREDITS** to
give or remove credits.

#### Connect the GitHub repository (deploys on every push)

1. **Cloudflare Dashboard → Workers & Pages → Create → Workers → Connect to Git**.
2. Choose **`ybenbrai/cars`**, project name `sunset-drift`, branch **`main`**.
3. Build command: **`npm run check && npm test && npm run build`**.
4. Deploy command: **`npx wrangler deploy`**. It uploads `dist/` and the Worker
   according to `wrangler.jsonc`.
5. Add the `ADMIN_TOKEN` secret described above.
6. Save and deploy.

Every push to `main` then builds and publishes. Do **not** use
`npx wrangler pages deploy` in this flow; it requires Pages authentication and
is not the configured Workers project. The site URL comes from the Workers
project (a `workers.dev` hostname or a custom domain configured in the
Cloudflare dashboard).

#### Local test of the Cloudflare build

```bash
npm run build
npx wrangler dev        # http://localhost:8787, full API and admin dashboard
```

Set `.dev.vars` locally with `ADMIN_TOKEN=...` before starting `wrangler dev`
to sign in to the admin dashboard.

### Plain object storage / CDN

Upload the contents of `dist/` to the bucket root. Enable static website hosting
and HTTPS. Make sure `.js` is served as `text/javascript` and `.webmanifest` as
`application/manifest+json`.

## Paths and subdirectories

All game references are relative (`styles.css`, `js/main.js`, `assets/...`), so
the build works at a domain root or at a subpath such as `/cars/`. The canonical
and social URLs in `index.html` point at the GitHub Pages location; update them
for a custom domain.

## Caching

The dev server sends `Cache-Control: no-cache` so edits are picked up on reload.
GitHub Pages does not expose custom response headers. For production CDNs, a
common policy is:

- `index.html`, `manifest.webmanifest`, `robots.txt`, `sitemap.xml` — short
  cache or revalidate.
- `js/*.js`, `assets/*` — long cache if you add content hashes to filenames.

The project does not currently fingerprint filenames, so avoid an aggressive
immutable cache policy without adding a version query or hash step.

## Custom domain

1. Add a `CNAME` file containing the domain to the deployed output. The simplest
   approach is to add `CNAME` to `ENTRIES` in `scripts/build.mjs`.
2. Configure the DNS record with the host.
3. Enable **Enforce HTTPS** in GitHub Pages settings.
4. Update the canonical, Open Graph and Twitter URLs in `index.html`, plus the
   sitemap and robots files.

## Post-deploy checklist

- [ ] The root URL loads the profile screen.
- [ ] Three.js and fonts load over HTTPS with no mixed-content warnings.
- [ ] The manifest and icons are reachable.
- [ ] A full race works on desktop and a phone.
- [ ] `localStorage` persists across a reload on the deployed origin.
- [ ] Social preview renders correctly (use a card validator if available).
- [ ] No 404s in the browser network panel.
- [ ] The Pages workflow is green and the environment URL is correct.

## What is not deployed

`server.mjs`, the test suite, the docs, GitHub workflows and the dev-only scripts
are repository tooling. Only `dist/` is published.
