import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LANGUAGES, TRANSLATED_KEYS, t } from '../js/i18n.js';

test('every translation row has all four languages filled in', async () => {
  const src = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../js/i18n.js', import.meta.url), 'utf8'));
  assert.ok(TRANSLATED_KEYS.length > 150);
  assert.equal(LANGUAGES.length, 5);
  // Each row is [es, fr, pt, de]: count the four-entry arrays in the table.
  const rows = src.match(/:\s*\[\s*(?:'[^']*'|"[^"]*")\s*,\s*(?:'[^']*'|"[^"]*")\s*,\s*(?:'[^']*'|"[^"]*")\s*,\s*(?:'[^']*'|"[^"]*")\s*,?\s*\]/g) || [];
  assert.equal(rows.length, TRANSLATED_KEYS.length);
});

test('English is the default and unknown text passes through', () => {
  assert.equal(t('START RACE'), 'START RACE');
  assert.equal(t('something new'), 'something new');
});

test('patterns and joined labels translate piece by piece', async () => {
  const mod = await import('../js/i18n.js');
  // translateText works without a DOM; switch language through its export.
  globalThis.document ??= { documentElement: {}, body: { nodeType: 1, childNodes: [] } };
  globalThis.MutationObserver ??= class { observe() {} };
  globalThis.Node ??= { TEXT_NODE: 3, ELEMENT_NODE: 1 };
  mod.setLanguage('es');
  assert.equal(mod.translateText('RANK CLUB'), 'RANGO CLUB');
  assert.equal(mod.translateText('NEED 3,000 CR'), 'FALTAN 3,000 CR');
  assert.equal(mod.translateText('EQUIPPED · STARTER HATCH'), 'EQUIPADO · COMPACTO DE INICIO');
  assert.equal(mod.translateText('GOLD TROPHY'), 'TROFEO DE ORO');
  assert.equal(mod.translateText('Costa Dorada · 1.8 KM · Beginner'), 'Costa Dorada · 1.8 KM · Principiante');
  assert.equal(mod.translateText('PULSE H3'), null);
  mod.setLanguage('en');
  assert.equal(mod.translateText('RANK CLUB'), null);
});
