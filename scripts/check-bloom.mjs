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
const newsletterProviderSchema = read('../supabase/newsletter-provider.sql');
const newsletterFunction = read('../supabase/functions/newsletter-subscribe/index.ts');
const enhancementsCss = read('../bloom-enhancements.css');
const hardeningSchema = read('../supabase/launch-hardening.sql');
const deleteAccount = read('../supabase/functions/delete-account/index.ts');
const engagementSchema = read('../supabase/feed-engagement.sql');
const marketplaceSchema = read('../supabase/marketplace.sql');
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
assert.ok(backend.includes('functions/v1/newsletter-subscribe'), 'Newsletter form must call the provider-backed Edge Function');
assert.match(backend, /newsletter-consent/, 'Newsletter submission must check explicit consent');
assert.match(backend, /newsletter-website/, 'Newsletter form must submit the honeypot field for basic bot filtering');
assert.ok(html.includes('id="newsletter-consent"') && html.includes('type="checkbox" required'), 'Newsletter requires explicit consent');
assert.ok(newsletterProviderSchema.includes('revoke all on public.newsletter_subscribers from public, anon, authenticated'), 'Subscriber table must not be publicly accessible');
assert.ok(newsletterProviderSchema.includes('grant select, insert, update, delete on public.newsletter_subscribers to service_role'), 'Only the server-side service role should manage subscriber records');
assert.ok(newsletterFunction.includes('https://bloomiedceo.github.io'), 'Newsletter CORS must default to the published GitHub Pages origin');
assert.ok(newsletterFunction.includes('RESEND_API_KEY'), 'Newsletter email provider key must stay server-side');
assert.ok(newsletterFunction.includes('action=confirm'), 'Newsletter must use double opt-in confirmation');
assert.ok(newsletterFunction.includes('action=unsubscribe'), 'Newsletter must provide an unsubscribe path');
assert.ok(newsletterFunction.includes('List-Unsubscribe-Post'), 'Newsletter emails must advertise one-click unsubscribe');
assert.ok(newsletterFunction.includes('req.method === "POST" && ["confirm", "unsubscribe"]'), 'Newsletter endpoint must require an explicit POST for confirmation and unsubscribe');
assert.ok(newsletterFunction.includes('api.resend.com/emails'), 'Newsletter function must call Resend API');
assert.match(newsletterFunction, /new Response\\(null, \\{ status: 204, headers: headers\\(origin\\) \\}\\)/, 'Newsletter CORS preflight must return an empty 204 response body');
assert.match(enhancements, /bloom-add-playlist-form/, 'BLOOM MUSIC must allow users to add their own Spotify playlist');
assert.match(enhancements, /parsePlaylistId/, 'Custom playlist URLs must be parsed and validated before embedding');
assert.match(enhancements, /bloom-custom-playlists/, 'Custom playlists must persist in this browser');
assert.match(enhancementsCss, /\\.newsletter-status\\{display:block;min-height/, 'Newsletter errors and confirmations must have a visible status area');
assert.match(upgrades, /#bloom-marketplace-listings/, 'Marketplace discovery links must stay inside BLOOM');
assert.match(upgrades, /content-visibility:auto;contain-intrinsic-size:auto 520px/, 'Feed cards should skip expensive offscreen rendering work');
assert.doesNotMatch(upgrades, /shopee\.com\.my|lazada\.com\.my|shop\.weverse\.io/i, 'Marketplace cards must not send buyers to external shopping apps');
assert.match(upgrades, /\$\$\('#product-grid \.product-card'\)\.forEach/, 'Marketplace must iterate over all product cards without a querySelector null error');
assert.match(upgrades, /const catalogue = \[/, 'Marketplace must render a browseable K-pop product discovery catalogue');
assert.match(upgrades, /#activity \.feed-card\[hidden\],#product-grid \.product-card\[hidden\]\{display:none!important\}/, 'FYP and marketplace filters must override card display styles when hiding items');
assert.equal((upgrades.match(/heart\.addEventListener\('click'/g) || []).length, 1, 'New catalogue wishlist buttons must have exactly one click handler');
assert.match(upgrades, /const initiallySaved = Array\.isArray\(saved\) && saved\.includes\(wishlistKey\)/, 'New catalogue wishlist buttons must restore saved state');
assert.match(upgrades, /heart\.setAttribute\('aria-pressed', String\(initiallySaved\)\)/, 'Wishlist buttons must expose saved state to assistive technology');
assert.match(upgrades, /if \(!write\('bloom-demo-wishlist', next\)\)/, 'New catalogue wishlist changes must report storage failures');
assert.match(enhancements, /const update=\(\)=>\{const yes=getWishlist\(\)\.includes\(name\)/, 'Existing product wishlist buttons must initialize and refresh from saved browser state');
assert.match(upgrades, /const id = card\.dataset\.postId/, 'Feed likes must use the clicked card ID rather than an undefined variable');
assert.ok((upgrades.match(/category:'(?:albums|style|accessories|concert|photocards|fashion|other)'/g) || []).length >= 10, 'Marketplace catalogue should include a range of K-pop product categories');
assert.ok(!html.includes('From $12') && !html.includes('From $28') && !html.includes('From $9') && !html.includes('From $22'), 'Product cards must not show stale placeholder prices');
assert.match(backend, /id="bloom-marketplace-listings"/, 'In-app marketplace listings container must exist');
assert.match(backend, /from\('marketplace_listings'\)/, 'Marketplace must read and publish shared database listings');
assert.match(backend, /from\('marketplace_inquiries'\)/, 'Marketplace must support in-app purchase requests and seller inbox');
assert.match(backend, /No payment has been taken/, 'Purchase requests must not falsely claim payment was processed');
assert.match(marketplaceSchema, /alter table public\.marketplace_listings enable row level security/, 'Marketplace listings must use RLS');
assert.match(marketplaceSchema, /marketplace buyers send request to active listing/, 'Only valid requests to another seller active listing should be accepted');
assert.match(marketplaceSchema, /marketplace sellers update own listings/, 'Only listing owners should be able to update listings');
assert.match(marketplaceSchema, /grant update\(status\) on public\.marketplace_inquiries to authenticated/i, 'Sellers may update only the inquiry status, not rewrite buyer or message data');
assert.match(upgrades, /bloom-feed-comments/, 'Feed comments must have a persistence key for local preview');
assert.match(enhancements, /\$\$\('\.feed-card',grid\)\.forEach/, 'Feed cards must be iterated as a collection');
assert.match(enhancements, /document\.addEventListener\('bloom:feed-updated',apply\)/, 'FYP filters must refresh when shared posts are loaded');
assert.match(backend, /card\.dataset\.fandom = post\.fandom \|\| 'Multi-stan'/, 'Shared posts must expose their fandom to the FYP filter');
assert.match(backend, /document\.dispatchEvent\(new CustomEvent\('bloom:feed-updated'\)\)/, 'Shared feed loading must notify FYP filters');
assert.doesNotMatch(enhancements, /(?<!\$)\$\([^\n)]*,\s*(?:grid|section|controls|roomList)\)\.forEach/, 'Single-element querySelector result must not be treated as a collection');
assert.match(enhancements, /id="bloom-player-host"/, 'Spotify iframe host must exist');
assert.match(enhancements, /id="bloom-mini-dock"/, 'Spotify dock control must exist');
assert.match(enhancements, /slot\.append\(frame\)/, 'Dock must move the real Spotify iframe');

assert.match(backend, /client\.auth\.onAuthStateChange/, 'Auth session listener must exist');
assert.match(backend, /await syncSession\(sessionData\.session\)/, 'Successful password reset must restore the signed-in account UI');
assert.match(backend, /setTimeout\(\(\) => \{ void syncSession\(session\); \}, 0\)/, 'Auth session work must run after the auth callback returns');
assert.match(backend, /from\('reports'\)/, 'Reporting flow must use the reports table');
assert.match(backend, /from\('post_likes'\)/, 'Shared likes must use the backend');
assert.match(backend, /from\('post_comments'\)/, 'Shared comments must use the backend');
assert.match(upgrades, /bloom-shared-post/, 'Preview interactions must not override shared-post controls');
assert.doesNotMatch(upgrades, /bloom-launch-feed-search|bloom-launch-feed-filter/, 'FYP must not create a second filter bar that competes with the shared search/fandom/saved filter');
assert.match(upgrades, /like\.removeAttribute\('data-action'\)/, 'Preview likes must use one click handler instead of updating two independent stores');
assert.match(upgrades, /const save = actionButtons\.find\(button => button\.dataset\.action === 'save'\)/, 'Decorating preview feed cards must preserve the Save control');
assert.match(upgrades, /let comment = \$\('\[data-bloom-action="comment"\]', actions\)/, 'Comment control must be separate from Save');

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
assert.match(hardeningSchema, /to_regprocedure\('public\.rls_auto_enable\(\)'\)/i, 'Optional Supabase RLS event-trigger hardening must work on fresh projects too');
assert.match(deleteAccount, /req\.method !== "POST"/, 'Account deletion endpoint must reject non-POST methods');
assert.match(deleteAccount, /authHeader\?\.startsWith\("Bearer "\)/, 'Account deletion must require a bearer token');
assert.match(deleteAccount, /admin\.auth\.getUser\(token\)/, 'Account deletion must verify the caller token');
assert.match(deleteAccount, /admin\.auth\.admin\.deleteUser\(data\.user\.id\)/, 'Account deletion must only delete the verified caller');
assert.match(deleteAccount, /SUPABASE_SERVICE_ROLE_KEY/, 'Privileged account deletion key must remain server-side');
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
