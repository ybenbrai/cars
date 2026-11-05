#!/usr/bin/env node
/**
 * Assemble the deployable static site in dist/.
 * The game has no bundler; this simply copies the runtime files.
 */
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');

const ENTRIES = [
  'index.html',
  'styles.css',
  'manifest.webmanifest',
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

console.log(`✔ built dist/ — ${count} files, ${mb} MB`);
