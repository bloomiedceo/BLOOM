import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('../bloom-unified-preview.html', import.meta.url), 'utf8');
const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m => m[1]);
const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
assert.deepEqual(duplicates, [], 'Preview must not contain duplicate IDs');

const viewNames = [...html.matchAll(/data-view=["']([^"']+)["']/g)].map(m => m[1]);
for (const view of new Set(viewNames)) {
  assert.ok(html.includes('id="v-' + view + '"'), 'Navigation target missing for view: ' + view);
}
for (const id of ['products','currency','currencySide','search','draftForm','profileForm','chatForm','modal','reports']) {
  assert.ok(ids.includes(id), 'Required preview element missing: ' + id);
}
assert.match(html, /Reference FX rates only/, 'Currency rates must be labelled as reference rates');
assert.match(html, /No real orders or payments/, 'Preview must not imply real checkout');
assert.match(html, /not private live messages/, 'Chat must be clearly labelled as a local preview');
assert.match(html, /saved on this device only|local only|locally/i, 'Local-only state must be disclosed');

const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
assert.ok(scripts.length > 0, 'Preview must contain its interaction script');
const check = spawnSync(process.execPath, ['--check'], { input: scripts.join('\n'), encoding: 'utf8' });
assert.equal(check.status, 0, 'Preview JavaScript syntax failed: ' + (check.stderr || check.stdout));
console.log('Unified BLOOM preview checks passed: unique IDs, navigation targets, key controls, demo disclosures, and JavaScript syntax.');
