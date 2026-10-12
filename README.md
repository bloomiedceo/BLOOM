# BLOOM — K-pop Community

BLOOM is a pastel pink and lavender K-pop community and fan-merch discovery website. The original single-page design and founder dashboard are preserved.

## Main files

- `index.html` — GitHub Pages entry point and original design.
- `bloom-enhancements.css` / `bloom-enhancements.js` — responsive feed, marketplace preview, music dashboard, and dockable Spotify player.
- `bloom-config.js` — public Supabase Project URL and publishable/anon key placeholders. It must never contain a service-role key.
- `bloom-backend.js` — optional Supabase Auth, shared posts, public groups, real-time group messages, reporting, and moderator queue UI.
- `supabase/schema.sql` — database tables, indexes, triggers, grants, and row-level security (RLS) policies.
- `supabase/functions/delete-account/index.ts` — server-side account deletion function; deploy it before advertising account deletion as available.
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

## Spotify and mini-player

BLOOM MUSIC is inserted by the enhancement script. The fixed player bar is visible at the bottom of the page. Select **Dock Spotify player** to move the actual Spotify iframe into the bottom dock while you browse; select **Return player** to put it back in the dashboard. The mini-player is a dock for Spotify's official embed, not a replacement for Spotify's own playback controls. Playback depends on Spotify, the selected playlist, browser support, region, and account restrictions.

## Connect the real backend (required before opening accounts/chat publicly)

GitHub Pages is static hosting. It cannot run the database, authenticate users on its own, or deliver shared messages. The included Supabase integration is **not live until you create and configure a Supabase project**.

1. Create a Supabase project in an account you control.
2. Open the project's **SQL Editor** and run the complete `supabase/schema.sql` file.
3. In **Authentication → URL Configuration**, set the Site URL to your published GitHub Pages URL and add that exact URL to the allowed redirect URLs.
4. In **Authentication → Providers / Email**, enable email sign-up and verification. Configure a real SMTP provider for launch; default/testing email delivery is not a production mail service. Set a suitable minimum password length (at least 10 characters) and enable available password/security protections.
5. In **Project Settings → API**, copy the Project URL and the public publishable/anon key into `bloom-config.js`. These are browser-visible values; RLS must be enabled as in the SQL file. **Never put a service-role/secret key in any frontend file or GitHub Pages.**
6. Deploy the account-deletion Edge Function with the Supabase CLI. From a trusted local development environment, link the project and set the server-side secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then deploy `supabase/functions/delete-account`. Keep the service-role key only in Supabase's server-side function secrets.
7. In a trusted admin workflow, assign `app_metadata.role = "moderator"` to approved moderator accounts. Never let users grant themselves moderator privileges through editable profile metadata.
8. Commit the configured public URL/key in `bloom-config.js`, push to `main`, and wait for GitHub Pages to redeploy. Do not treat the site as a live community until the checks below pass.

### What the starter backend includes

- Supabase email/password sign-up, sign-in, email verification flow, password-reset email, and password update after recovery.
- Profile display name and private-profile setting.
- Shared posts with public/private profile visibility, reporting, and a moderator queue for hiding posts/resolving reports.
- Public group discovery, group creation/membership, and Realtime group messages.
- A server-side account deletion Edge Function.
- RLS policies on profiles, posts, groups, group membership, messages, and reports.

### Not included yet / do not advertise as finished

- Photo/video uploads, direct messages, private-group invitations, block/mute, push notifications, a full appeals workflow, seller checkout, inventory, payments, and production affiliate tracking.
- Formal legal advice or a final privacy policy. The current privacy notice and community guidelines are drafts that must be customized to the real operator, vendors, contact details, retention practices, age policy, and applicable Malaysian/privacy requirements.
- Automated spam/abuse rate limiting, backups/restore drills, incident response, and full browser/device accessibility testing.
- A deployed Supabase project, configured email delivery, configured Edge Function, or tested moderator account. These require owner-side setup.

## Preview-only features

When `bloom-config.js` has blank values, the website deliberately stays in preview mode. Likes, saved posts, demo posts, wishlist items, seller listings, and demo chat are saved only in the current browser; they are not shared with other visitors. Do not enter real passwords or private information into preview forms.

## Pre-launch smoke-test checklist

- [ ] GitHub Pages deployment succeeds and there are no JavaScript console errors.
- [ ] Test on desktop and a narrow mobile screen; check keyboard focus and reduced-motion settings.
- [ ] Spotify section and fixed mini-player appear; dock/return the actual embed; switch all three playlists.
- [ ] Search the marketplace and test every category, wishlist, and reset button.
- [ ] With Supabase configured, create two test accounts and verify email confirmation works.
- [ ] Test sign-in, wrong-password errors, password-reset email, and password update from the recovery link.
- [ ] Test private-profile visibility from a separate signed-in account and a signed-out browser.
- [ ] Create a post, report it from a second account, hide it as a moderator, and confirm it is no longer public.
- [ ] Create a public group, join it from a second account/device, send messages both ways, and verify non-members cannot read messages.
- [ ] Test account deletion after deploying the Edge Function and confirm related data is removed.
- [ ] Verify RLS for every table and test unauthorized reads/writes; never use the service-role key in the browser.
- [ ] Customize and review the privacy notice, community rules, age policy, affiliate disclosures, contact route, and moderation/appeal process.
- [ ] Configure production email delivery, abuse controls, backups, monitoring, and a real moderation rota before announcing launch.
