#!/usr/bin/env node
/**
 * Assemble the deployable static site in dist/.
 * The game has no bundler; this copies the runtime files and stamps every
 * module URL with a content hash (`?v=…`). Without that, a browser can keep an
 * old cached module next to new ones after a deploy, and the mix breaks the
 * game (e.g. new main.js calling a function an old cached audio.js lacks).
 */
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');

const ENTRIES = [
  'index.html',
  'admin.html',
  'styles.css',
  'manifest.webmanifest',
  'sw.js',
  'robots.txt',
  'sitemap.xml',
  'js',
  'assets',
];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const entry of ENTRIES) {
  await cp(join(root, entry), join(out, entry), { recursive: true });
}

async function walk(dir) {
  const files = [];
  for (const name of await readdir(dir)) {
    const file = join(dir, name);
    if ((await stat(file)).isDirectory()) files.push(...await walk(file));
    else files.push(file);
  }
  return files.sort();
}

// One version for the whole release, derived from the shipped code.
const codeFiles = (await walk(join(out, 'js'))).filter((f) => f.endsWith('.js'));
const hash = createHash('sha256');
for (const file of [...codeFiles, join(out, 'styles.css'), join(out, 'index.html')]) {
  hash.update(file.slice(out.length));
  hash.update(await readFile(file));
}
const version = hash.digest('hex').slice(0, 10);

// Relative module specifiers only; bare ones ('three') go through the CDN.
const IMPORT_RE = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"?]+?\.js)\2/g;
export function stampImports(source, v) {
  return source.replace(IMPORT_RE, (_, lead, quote, spec) => `${lead}${quote}${spec}?v=${v}${quote}`);
}
for (const file of codeFiles) {
  const source = await readFile(file, 'utf8');
  await writeFile(file, stampImports(source, version));
}
const htmlFile = join(out, 'index.html');
const html = (await readFile(htmlFile, 'utf8'))
  .replace('src="js/main.js"', `src="js/main.js?v=${version}"`)
  .replace('href="styles.css"', `href="styles.css?v=${version}"`);
if (!html.includes(`js/main.js?v=${version}`) || !html.includes(`styles.css?v=${version}`)) {
  throw new Error('index.html no longer references js/main.js or styles.css as expected.');
}
await writeFile(htmlFile, html);

async function measure(dir) {
  let bytes = 0;
  let count = 0;
  for (const name of await readdir(dir)) {
    const file = join(dir, name);
    const info = await stat(file);
    if (info.isDirectory()) {
      const nested = await measure(file);
      bytes += nested.bytes;
      count += nested.count;
    } else {
      bytes += info.size;
      count += 1;
    }
  }
  return { bytes, count };
}

const { bytes, count } = await measure(out);
const mb = (bytes / 1024 / 1024).toFixed(2);

console.log(`✔ built dist/ — ${count} files, ${mb} MB, release ${version}`);
