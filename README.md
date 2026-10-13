# BLOOM — K-pop Community

BLOOM is a pastel pink and lavender K-pop community and fan-merch discovery website. The original single-page design and founder dashboard are preserved.

## Main files

- `index.html` — GitHub Pages entry point and original design.
- `bloom-enhancements.css` / `bloom-enhancements.js` — responsive feed, media composer, in-app Spotify embed, and interface upgrades.
- `bloom-config.js` — public Supabase Project URL and publishable/anon key placeholders. It must never contain a service-role key.
- `bloom-backend.js` — optional Supabase Auth, shared posts, public groups, real-time group messages, shared post likes/comments, reporting, and moderator queue UI.
- `bloom-launch-upgrades.js` — vertical scrollable feed layout, fandom search/filter, preview-only local likes/comments, sharing controls, and marketplace links.
- `supabase/schema.sql` — core database tables, indexes, triggers, grants, and row-level security (RLS) policies.
- `supabase/feed-engagement.sql` — additional RLS-protected tables and RPC for shared post likes/comment counts; run after the core schema.
- `supabase/newsletter-signups.sql` — legacy signup table migration, now locked down.
- `supabase/newsletter-provider.sql` — private, RLS-protected subscriber table for double-opt-in email.
- `supabase/launch-hardening.sql` — restricts direct execution of trigger-only functions, optimizes moderator RLS expressions, and adds foreign-key indexes.
- `supabase/functions/delete-account/index.ts` — server-side account deletion function; deployed with JWT verification enabled.
- `supabase/functions/newsletter-subscribe/index.ts` — Resend-backed confirmation/unsubscribe endpoint.
- `bloom_kpop_community_launch_preview (1).html` and `bloom_ceo_dashboard.html` — original files retained.

## Preview locally

Open `index.html` in a modern browser. For a local HTTP preview, run:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Publish with GitHub Pages

1. Open **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/(root)`, then save.
3. Wait for the Pages deployment to finish and use the URL GitHub displays. The usual project-site URL is `https://bloomiedceo.github.io/Bloom-Kpop-Community/`.
4. Check the **Actions** tab for failed deployments or validation checks.

## Safety Center

The top navigation and footer Safety links open a dedicated Safety Center dialog with account security, privacy, community conduct, and reporting guidance. The report button opens the existing feedback preview with the safety category selected. **The feedback form is still a preview and does not send or store reports**, so do not rely on it for urgent or monitored support until a private, staffed reporting service is connected.

## Spotify in BLOOM MUSIC

BLOOM MUSIC uses Spotify's official embedded player. To add a playlist you already use, open Spotify, choose **Share → Copy link**, paste the link into BLOOM MUSIC, and select **Show Spotify player**. Public playlist, album, artist, track, show, and episode links are supported. BLOOM does not create playlists, upload audio files, or copy Spotify tracks; Spotify handles playback, sign-in, and availability. You can also open the same item directly in Spotify.

## Connect the real backend (required before opening accounts/chat publicly)

GitHub Pages is static hosting. It cannot run the database, authenticate users on its own, or deliver shared messages. The Supabase integration depends on the matching project being reachable and its schema, RLS policies, Auth redirects, and email delivery being configured correctly. A configured frontend URL/key alone does not prove every production feature is ready.

1. If you have not already done so, create a Supabase project in an account you control. Confirm that the project URL in `bloom-config.js` is the project you intend to use.
2. Open the project's **SQL Editor** and run the complete `supabase/schema.sql` file, then run `supabase/feed-engagement.sql` to enable shared likes and comments. Re-run neither by copying partial snippets; use the complete files in order.
3. In **Authentication → URL Configuration**, set the Site URL to your published GitHub Pages URL and add that exact URL to the allowed redirect URLs.
4. In **Authentication → Providers / Email**, enable email sign-up and email confirmation. For production Auth mail, configure **Authentication → SMTP Settings** with your verified Resend sender: host `smtp.resend.com`, port `465`, username `resend`, and your Resend API key as the password. Set the sender email to an address on your verified domain. Set a suitable minimum password length (at least 10 characters) and enable leaked-password protection in the Auth password/security settings. The SMTP credentials and leaked-password toggle must be set in the Dashboard before launch.
5. Run `supabase/newsletter-provider.sql` after the core schema. The public website calls the `newsletter-subscribe` Edge Function; it does not write email addresses directly from the browser. The function uses Resend for double opt-in and unsubscribe. Set the server-side secrets `RESEND_API_KEY`, `BLOOM_FROM_EMAIL` (a sender on a verified domain), and `BLOOM_SITE_URL`. Never place these values in `bloom-config.js` or GitHub.
6. In **Project Settings → API**, confirm `bloom-config.js` contains that project's Project URL and public publishable/anon key. These are browser-visible values; RLS must be enabled as in the SQL files. **Never put a service-role/secret key in any frontend file or GitHub Pages.**
7. The account-deletion and newsletter Edge Functions are deployed. Keep `SUPABASE_SERVICE_ROLE_KEY` only in Supabase's server-side function secrets. The newsletter function also needs the Resend/site secrets listed above.
8. In a trusted admin workflow, assign `app_metadata.role = "moderator"` to approved moderator accounts. Never let users grant themselves moderator privileges through editable profile metadata.
9. After reviewing the draft changes, merge the pull request into `main` and wait for GitHub Pages to redeploy. Do not treat the site as a production-ready community until the checks below pass.

### What the starter backend includes

- Supabase email/password sign-up, sign-in, email verification flow, password-reset email, and password update after recovery.
- Profile display name and private-profile setting.
- Shared posts with public/private profile visibility, reporting, and a moderator queue for hiding posts/resolving reports. Shared post likes/comments require `supabase/feed-engagement.sql`.
- Public group discovery, group creation/membership, and Realtime group messages.
- A server-side account deletion Edge Function.
- RLS policies on profiles, posts, groups, group membership, messages, and reports.

### Not included yet / do not advertise as finished

- Photo/video uploads, direct messages, private-group invitations, block/mute, push notifications, a full appeals workflow, seller checkout, inventory, payments, and production affiliate tracking.
- Formal legal advice or a final privacy policy. The current privacy notice and community guidelines are drafts that must be customized to the real operator, vendors, contact details, retention practices, age policy, and applicable Malaysian/privacy requirements.
- Automated spam/abuse rate limiting, backups/restore drills, incident response, and full browser/device accessibility testing.
- Verified Supabase project configuration, production email delivery, a deployed Edge Function, or a tested moderator account. These require owner-side setup and real-world tests.

## Preview-only features

When `bloom-config.js` has blank values, the website deliberately stays in preview mode. Likes, saved posts, demo posts, wishlist items, seller listings, and demo chat are saved only in the current browser; they are not shared with other visitors. Do not enter real passwords or private information into preview forms.

## Automated checks

GitHub Actions runs JavaScript syntax checks and `scripts/check-bloom.mjs`, which guards against the single-element selector bug that previously stopped the enhancement script, verifies Safety Center wiring and Spotify embed validation, and checks key RLS/security invariants. Static checks are not a substitute for browser testing, Supabase RLS tests, accessibility review, or a two-account integration test.

## Pre-launch smoke-test checklist

- [ ] GitHub Pages deployment succeeds and there are no JavaScript console errors.
- [ ] Test on desktop and a narrow mobile screen; check keyboard focus and reduced-motion settings.
- [ ] Click Safety in the top navigation and Safety center in the footer; verify the Safety Center opens, closes, and opens the safety report preview.
- [ ] Spotify section loads a valid official embed from a copied Spotify share link; verify invalid links show a helpful error.
- [ ] Search the marketplace and test every category, wishlist, and reset button. Confirm Weverse/Shopee listings open and marketplace searches show current offers; seller prices/stock can change.
- [ ] Run `supabase/feed-engagement.sql`, then test shared post likes/comments with two accounts and confirm private-profile posts stay private.
- [ ] With Supabase configured, create two test accounts and verify email confirmation works.
- [ ] Test sign-in, wrong-password errors, password-reset email, and password update from the recovery link.
- [ ] Test private-profile visibility from a separate signed-in account and a signed-out browser.
- [ ] Create a post, report it from a second account, hide it as a moderator, and confirm it is no longer public.
- [ ] Create a public group, join it from a second account/device, send messages both ways, and verify non-members cannot read messages.
- [ ] Test account deletion using a disposable test account and confirm related data is removed.
- [ ] Verify RLS for every table and test unauthorized reads/writes; never use the service-role key in the browser.
- [ ] Customize and review the privacy notice, community rules, age policy, affiliate disclosures, contact route, and moderation/appeal process.
- [ ] Set Resend API key, verified sender address, and published site URL as Edge Function secrets; then set `newsletterEnabled: true` in `bloom-config.js` and test confirmation, duplicate signup, and one-click unsubscribe.
- [ ] Enable leaked-password protection, configure Supabase Auth custom SMTP, add abuse controls/CAPTCHA, verify backups/monitoring, and establish a real moderation rota before announcing launch.
