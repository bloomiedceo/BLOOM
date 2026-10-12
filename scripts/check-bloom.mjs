import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => readFileSync(new URL(path, import.meta.url).pathname, 'utf8');
const html = read('../index.html');
const enhancements = read('../bloom-enhancements.js');
const backend = read('../bloom-backend.js');
const config = read('../bloom-config.js');
const schema = read('../supabase/schema.sql');
const css = read('../bloom-enhancements.css');

assert.match(html, /id="safety-modal"[^>]*role="dialog"[^>]*aria-modal="true"/, 'Safety Center dialog must exist and expose dialog semantics');
assert.match(html, /function openSafetyReport\(\)/, 'Safety report action must be wired');
assert.match(html, /function goToSafetyChecklist\(\)/, 'Launch checklist action must be wired');
assert.match(html, /document\.querySelectorAll\('a\[href="#safety"\]'\)/, 'Safety navigation links must open the Safety Center');
assert.match(html, /id="feedback-modal"/, 'Safety report must have a feedback form target');
assert.match(html, /id="safety"[^>]*>/, 'Launch checklist target must exist');
assert.match(css, /\.safety-modal-grid/, 'Safety Center must have responsive styling');

assert.match(enhancements, /\$\$\('\.feed-card',grid\)\.forEach/, 'Feed cards must be iterated as a collection');
assert.doesNotMatch(enhancements, /(?<!\$)\$\([^\n)]*,\s*(?:grid|section|controls|roomList)\)\.forEach/, 'Single-element querySelector result must not be treated as a collection');
assert.match(enhancements, /id="bloom-player-host"/, 'Spotify iframe host must exist');
assert.match(enhancements, /id="bloom-mini-dock"/, 'Spotify dock control must exist');
assert.match(enhancements, /slot\.append\(frame\)/, 'Dock must move the real Spotify iframe');

assert.match(backend, /client\.auth\.onAuthStateChange/, 'Auth session listener must exist');
assert.match(backend, /setTimeout\(\(\) => \{ void syncSession\(session\); \}, 0\)/, 'Auth session work must run after the auth callback returns');
assert.match(backend, /from\('reports'\)/, 'Reporting flow must use the reports table');
assert.match(config, /url:\s*""/);
assert.match(config, /anonKey:\s*""/);
assert.doesNotMatch(config, /service_role\s*:/i, 'Browser config must never contain a service-role key');
for (const table of ['profiles','posts','groups','group_members','messages','reports']) {
  assert.ok(schema.includes('alter table public.' + table + ' enable row level security;'), 'RLS must be enabled on ' + table);
}
assert.match(schema, /and role = 'member'/, 'Clients must not assign privileged group roles');
assert.match(schema, /auth\.jwt\(\) -> 'app_metadata' ->> 'role'/, 'Moderator checks must use trusted app metadata');
console.log('BLOOM static checks passed: safety navigation, Spotify wiring, frontend selector safety, and backend security invariants.');
