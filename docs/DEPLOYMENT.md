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

### Cloudflare Pages

Cloudflare Pages can host the whole static game on its free plan, and it can
redeploy automatically on every push. No code changes are needed: the build
already outputs a self-contained `dist/` folder.

Free-plan limits that matter here: **500 builds per month** (one at a time),
up to 20,000 files per site, 25 MiB per file and 100 custom domains. This build
is roughly 50 files and under 1 MB, so it fits comfortably.

#### Connect the GitHub repository (recommended, deploys on every push)

1. Open **Cloudflare Dashboard → Workers & Pages → Create → Pages →
   Connect to Git**.
2. Authorize GitHub and choose **`ybenbrai/cars`**.
3. Project name: `sunset-drift` (this becomes
   `https://sunset-drift.pages.dev`).
4. Production branch: **`main`**.
5. Framework preset: **None**.
6. Build command: **`npm run check && npm test && npm run build`**
   (or just `npm run build` if you do not want tests to block deploys).
7. Build output directory: **`dist`**.
8. Root directory: leave blank.
9. Node version: the repo's `.nvmrc` (20) is detected automatically; add a
   `NODE_VERSION = 20` environment variable only if the build image ignores it.
10. Save and deploy.

From then on, every push to `main` builds and publishes a new production
deployment. Pushes to other branches create preview deployments with their own
URLs. Nothing else is required — no Wrangler config, secrets or workflow file.

To use a custom domain, open the Pages project → **Custom domains** → add the
domain and follow the DNS instructions. HTTPS is issued automatically.

#### Manual deploy (optional)

For a one-off upload from your machine:

```bash
npm run build
npx wrangler pages deploy dist --project-name sunset-drift
```

The first run asks you to log in to Cloudflare. This is useful for testing, but
the Git integration above is what makes every push deploy automatically.

#### What does not work on static hosting

Cloudflare Pages serves static files only. It does not run `server.mjs`, so the
account system and online multiplayer are unavailable there, exactly as on
GitHub Pages; the game stays fully playable as a local guest with saves in
`localStorage`. To keep accounts and online races, host the Node server
separately (Render, Railway, Fly.io, a VPS) or port its API and WebSocket rooms
to Cloudflare Workers/Durable Objects. That port is a separate project.

The canonical, Open Graph, sitemap and robots URLs still point at the GitHub
Pages address. Update those if the Cloudflare domain becomes the main one.

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
