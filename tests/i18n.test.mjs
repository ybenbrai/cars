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
