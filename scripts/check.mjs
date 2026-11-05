#!/usr/bin/env node
/**
 * Zero-dependency project checks used locally and in CI.
 * Validates JavaScript syntax, JSON, local references and generated asset presence.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
let checked = 0;

const REQUIRED = [
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'server.mjs',
  'js/main.js',
  'assets/icon.svg',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/og-image.jpg',
  'docs/screenshots/race.jpg',
];

function fail(message) {
  failures.push(message);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (['.git', 'node_modules', 'dist', '.DS_Store'].includes(name)) continue;
    const file = join(dir, name);
    const info = statSync(file);
    if (info.isDirectory()) walk(file, out);
    else out.push(file);
  }
  return out;
}

for (const file of REQUIRED) {
  if (!existsSync(join(root, file))) fail(`missing required file: ${file}`);
}

const files = walk(root);

for (const file of files) {
  const ext = extname(file);
  const rel = relative(root, file);

  if (ext === '.js' || ext === '.mjs') {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) fail(`syntax error in ${rel}\n${result.stderr.trim()}`);
    checked += 1;
  }

  if (ext === '.json' || ext === '.webmanifest') {
    try {
      JSON.parse(readFileSync(file, 'utf8'));
      checked += 1;
    } catch (error) {
      fail(`invalid JSON in ${rel}: ${error.message}`);
    }
  }
}

// Local references from index.html must exist.
const html = readFileSync(join(root, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="(?!https?:|\/\/|#|data:|mailto:)([^"]+)"/g)].map((match) => match[1]);
for (const ref of refs) {
  const target = resolve(join(root, ref.split('?')[0]));
  if (!existsSync(target)) fail(`index.html references missing file: ${ref}`);
}

// Relative ES module imports must resolve.
for (const file of files.filter((candidate) => candidate.endsWith('.js') || candidate.endsWith('.mjs'))) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/(?:from\s+|import\s*\()(['"])(\.[^'"]+)\1/g)) {
    const spec = match[2];
    const target = resolve(dirname(file), spec);
    if (!existsSync(target) && !existsSync(`${target}.js`)) {
      fail(`${relative(root, file)} imports missing module: ${spec}`);
    }
  }
}

// Relative links in documentation must resolve.
const markdownFiles = files.filter((file) => file.endsWith('.md'));
let markdownLinks = 0;
for (const file of markdownFiles) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/\]\((?!https?:|mailto:|#)([^)\s]+)\)/g)) {
    const target = decodeURIComponent(match[1].split('#')[0]);
    if (!target) continue;
    markdownLinks += 1;
    if (!existsSync(resolve(dirname(file), target))) {
      fail(`${relative(root, file)} links to missing file: ${match[1]}`);
    }
  }
}

// Lightweight CSS sanity check.
const css = readFileSync(join(root, 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const opens = (css.match(/{/g) || []).length;
const closes = (css.match(/}/g) || []).length;
if (opens !== closes) fail(`styles.css has unbalanced braces (${opens} open, ${closes} close)`);

if (!/<meta name="viewport"/.test(html)) fail('index.html is missing a viewport meta tag');
if (!/<html lang="en"/.test(html)) fail('index.html is missing a language attribute');

if (failures.length) {
  console.error(`\n✖ ${failures.length} check(s) failed:\n`);
  for (const failure of failures) console.error(`  • ${failure}`);
  process.exit(1);
}

console.log(`✔ checks passed — ${checked} JS/JSON files, ${refs.length} HTML references and ${markdownLinks} doc links validated`);
