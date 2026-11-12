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

Cloudflare runs the whole game, including accounts, cloud saves and online
races, on the Workers free plan. `wrangler.jsonc` serves the prebuilt `dist/`
folder as static assets and routes `/api/*` to `worker/index.js`, which
forwards every API call and WebSocket to one SQLite-backed Durable Object
(`GameServer`):

- **Accounts:** PBKDF2-SHA256 (100,000 iterations) password hashes, opaque
  HttpOnly `SameSite=Strict` session cookies, 30-day sessions.
- **Cloud saves:** one record per account with the same optimistic-concurrency
  rule as `server.mjs` (HTTP 409 when another device saved first).
- **Online lobby:** `server/rooms.mjs` runs unchanged inside the object; its
  WebSocket connections keep it alive while anyone is connected.

Hashing and the lobby run in the Durable Object rather than the Worker
because the free Worker has a 10 ms CPU limit per request.

The API is identical to `server.mjs`, so the browser code needs no changes.
Accounts created on a self-hosted Node server do not carry over.

#### Connect the GitHub repository (deploys on every push)

1. **Cloudflare Dashboard → Workers & Pages → Create → Workers → Connect to Git**.
2. Choose **`ybenbrai/cars`**, project name `sunset-drift`, branch **`main`**.
3. Build command: **`npm run check && npm test && npm run build`**.
4. Deploy command: **`npx wrangler deploy`**. It bundles `worker/index.js`,
   uploads `dist/` and creates the Durable Object on the first deploy
   (migration `v1`).
5. Save and deploy.

Every push to `main` then builds and publishes. Do **not** use
`npx wrangler pages deploy`: Pages cannot run the Worker or Durable Object.

#### Admin dashboard (`/admin`)

The Worker also serves an admin dashboard at `https://<your-site>/admin`:
overview KPIs and charts, player search with details and actions (credits,
reset, sign out everywhere, kick, ban, delete), live online rooms (close room,
kick), game switches (announcement shown to players, pause sign-ups, pause
online play), CSV export and an audit log of every admin action.

It stays switched off until you add a secret:

1. Cloudflare Dashboard → your `sunset-drift` Worker → **Settings → Variables
   and Secrets → Add** → type **Secret**, name **`ADMIN_TOKEN`**, value: a long
   random string (16+ characters; a password manager can generate one).
2. Deploy (or wait for the next push), open `/admin` and paste the token.

The token is never stored in the browser: signing in gives a 12-hour HttpOnly
admin cookie scoped to `/api/admin`. Rotate the secret to revoke access.

#### Local test of the Cloudflare build

```bash
npm run build
npx wrangler dev        # http://localhost:8787, with a local Durable Object
```

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
