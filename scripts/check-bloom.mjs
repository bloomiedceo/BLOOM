import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => readFileSync(new URL(path, import.meta.url).pathname, 'utf8');
const html = read('../index.html');
const enhancements = read('../bloom-enhancements.js');
const upgrades = read('../bloom-launch-upgrades.js');
const backend = read('../bloom-backend.js');
const config = read('../bloom-config.js');
const schema = read('../supabase/schema.sql');
const newsletterSchema = read('../supabase/newsletter-signups.sql');
const hardeningSchema = read('../supabase/launch-hardening.sql');
const engagementSchema = read('../supabase/feed-engagement.sql');
const css = read('../bloom-enhancements.css');

assert.match(html, /id="safety-modal"[^>]*role="dialog"[^>]*aria-modal="true"/, 'Safety Center dialog must exist and expose dialog semantics');
assert.match(html, /function openSafetyReport\(\)/, 'Safety report action must be wired');
assert.match(html, /function goToSafetyChecklist\(\)/, 'Launch checklist action must be wired');
assert.match(html, /document\.querySelectorAll\('a\[href="#safety"\]'\)/, 'Safety navigation links must open the Safety Center');
assert.match(html, /id="feedback-modal"/, 'Safety report must have a feedback form target');
assert.match(html, /id="safety"[^>]*>/, 'Launch checklist target must exist');
assert.match(css, /\.safety-modal-grid/, 'Safety Center must have responsive styling');

assert.match(html, /src="bloom-launch-upgrades\.js"/, 'Feed and marketplace upgrade script must be loaded');
assert.match(html, /id="newsletter-status"[^>]*role="status"[^>]*aria-live="polite"/, 'Newsletter form must expose an accessible live status');
assert.match(backend, /from\('newsletter_signups'\)\.insert/, 'Newsletter form must save through the configured backend');
assert.match(backend, /Newsletter signup is not connected yet/, 'Newsletter must not claim success when backend is unavailable');
assert.match(html, /Email delivery is not active until a newsletter provider is connected/, 'Newsletter copy must disclose that delivery still needs setup');
assert.match(upgrades, /Shopee/, 'Marketplace cards must have real marketplace destinations');
assert.ok(upgrades.includes('https://shop.weverse.io/en/shop/USD/artists/2/sales/54189'), 'Official Weverse product link must be present');
assert.ok(!html.includes('From $12') && !html.includes('From $28') && !html.includes('From $9') && !html.includes('From $22'), 'Product cards must not show stale placeholder prices');
assert.match(upgrades, /Search Lazada/, 'Marketplace cards must include a second destination');
assert.match(upgrades, /bloom-feed-comments/, 'Feed comments must have a persistence key for local preview');
assert.match(enhancements, /\$\$\('\.feed-card',grid\)\.forEach/, 'Feed cards must be iterated as a collection');
assert.doesNotMatch(enhancements, /(?<!\$)\$\([^\n)]*,\s*(?:grid|section|controls|roomList)\)\.forEach/, 'Single-element querySelector result must not be treated as a collection');
assert.match(enhancements, /id="bloom-player-host"/, 'Spotify iframe host must exist');
assert.match(enhancements, /id="bloom-mini-dock"/, 'Spotify dock control must exist');
assert.match(enhancements, /slot\.append\(frame\)/, 'Dock must move the real Spotify iframe');

assert.match(backend, /client\.auth\.onAuthStateChange/, 'Auth session listener must exist');
assert.match(backend, /setTimeout\(\(\) => \{ void syncSession\(session\); \}, 0\)/, 'Auth session work must run after the auth callback returns');
assert.match(backend, /from\('reports'\)/, 'Reporting flow must use the reports table');
assert.match(backend, /from\('post_likes'\)/, 'Shared likes must use the backend');
assert.match(backend, /from\('post_comments'\)/, 'Shared comments must use the backend');
assert.match(upgrades, /bloom-shared-post/, 'Preview interactions must not override shared-post controls');
assert.match(config, /url:\s*"https:\/\/[^\"]+\.supabase\.co"/, 'Supabase project URL must be configured');
assert.match(config, /anonKey:\s*"[^\"]+"/, 'Supabase public frontend key must be configured');
assert.doesNotMatch(config, /service_role\s*:/i, 'Browser config must never contain a service-role key');
for (const table of ['profiles','posts','groups','group_members','messages','reports']) {
  assert.ok(schema.includes('alter table public.' + table + ' enable row level security;'), 'RLS must be enabled on ' + table);
}
assert.match(schema, /and role = 'member'/, 'Clients must not assign privileged group roles');
assert.match(schema, /\(select auth\.jwt\(\)\) -> 'app_metadata' ->> 'role'/, 'Moderator checks must use trusted app metadata through a stable init plan');
assert.match(hardeningSchema, /revoke all on function public\.bloom_create_profile\(\) from public, anon, authenticated/i, 'Profile trigger function must not be exposed as an RPC');
assert.match(hardeningSchema, /revoke all on function public\.bloom_add_group_owner\(\) from public, anon, authenticated/i, 'Group owner trigger function must not be exposed as an RPC');
assert.match(hardeningSchema, /alter policy .*\(select auth\.jwt\(\)\)/s, 'Hardening migration must use stable JWT expressions in moderator policies');
assert.match(engagementSchema, /cardinality\(target_post_ids\) between 1 and 100/, 'Engagement RPC must cap request size');
for (const table of ['post_likes','post_comments']) {
  assert.ok(engagementSchema.includes('alter table public.' + table + ' enable row level security;'), 'RLS must be enabled on ' + table);
}
for (const index of ['bloom_groups_owner_idx','bloom_messages_author_idx','bloom_post_comments_author_idx','bloom_post_likes_user_idx','bloom_posts_author_idx','bloom_reports_reporter_idx','bloom_reports_reviewed_by_idx']) {
  assert.match(hardeningSchema, new RegExp('create index if not exists ' + index), 'Missing foreign-key index ' + index);
}
assert.match(newsletterSchema, /enable row level security/i, 'Newsletter signups must use row-level security');
assert.match(newsletterSchema, /create policy/i, 'Newsletter signups must have an explicit insert policy');
console.log('BLOOM static checks passed: safety navigation, Spotify wiring, frontend selector safety, and backend security invariants.');
