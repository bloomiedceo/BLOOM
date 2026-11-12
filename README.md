# BLOOM — Your world, in full colour

BLOOM is a universal social garden for people to share what they love, find people with similar interests, and grow a personal Garden Grid. The default visual system is white, soft cream, nude, violet, and pink. The public app has four destinations—Wild Feed, The Greenhouse, Notifications, and Garden Grid—plus a prominent central Create button.

## Current app files

- `index.html` — responsive, mobile-first application shell and five-position bottom navigation.
- `bloom-app.css` — default cream/nude light theme, optional dark theme, responsive layouts, and modals.
- `bloom-app.js` — guest feed, Supabase Auth, onboarding, photo studio and filters, Plants, reactions, comments, reporting, blocking, circles, DMs, realtime messages, notifications, profile settings, and feedback.
- `bloom-config.js` — public Supabase project URL and publishable key. It must never contain a service-role or secret key.
- `supabase/universal-social-platform.sql` — additive migration for the universal BLOOM schema, RLS, storage bucket, DM RPC, counters, notification triggers, and starter data.
- `supabase/functions/delete-account/index.ts` — server-side account deletion with cleanup of user files in the BLOOM media buckets. Deploy after reviewing the function and configuring its server-side secrets.
- `scripts/check-bloom.mjs` — static JavaScript, UX wiring, schema, and security regression checks.

## Universal BLOOM terminology

- **Wild Feed** — public and personalised Plants.
- **The Greenhouse** — public Interest Circles and private one-to-one DMs.
- **Plants** — user posts with a photo, filter, caption, and interest category.
- **Sunlight** — a reaction that adds to the Plant owner's received Sunlight total.
- **Gardeners** — followers of a public profile.
- **Your Mix** — feed preferences stored on the profile and editable in Settings.
- **Garden Market** — Coming Soon only; listing and checkout functionality is intentionally not enabled.

Old fandom-specific and album showcase routes now redirect to the universal BLOOM entry point. They are not loaded by the current app.

## Supabase setup

The current browser configuration points to the existing BLOOM Supabase project. The publishable key is expected to be visible in a static frontend; never use a service-role key in browser code.

### Database migration

The new migration is designed to be additive against the existing BLOOM schema. It keeps legacy columns (such as `author_id`, `body`, and the old group references) while adding the universal columns and tables, so existing records are not deliberately deleted.

1. Open the BLOOM Supabase project and go to **SQL Editor**.
2. Review `supabase/universal-social-platform.sql` in full.
3. Run it once. The migration is written to be repeatable for the schema objects it creates.
4. Verify that the following exist: `circles`, `circle_members`, `post_reactions`, `blocked_users`, `follows`, `feedback`, and `sample_plants`; that `bloom-media` exists as a public bucket; and that the new public/authenticated RLS policies are enabled.
5. Verify that the four starter circles and five sample Plants appear.

The existing `profiles`, `posts`, `post_comments`, `messages`, and `notifications` tables are extended rather than replaced. Legacy columns are populated for compatibility with the existing database and old triggers.

### Important public-media privacy note

The requested `bloom-media` bucket is public. That means an uploaded photo's public URL can be viewed by anyone who has the URL, even if the profile is marked private. Upload permissions are restricted to each signed-in user's own folder, but public downloads are not private. Do not use this bucket for sensitive or private-only photos. A fully private-media design would require a separate private bucket and signed URLs for private-account content.

### Authentication and email

In **Authentication → URL Configuration**, set the Site URL and allowed redirect URL to the published BLOOM URL. Confirm email/password sign-up works. For reliable production email, configure custom SMTP and enable leaked-password protection in Supabase Auth settings. A local browser preview is not proof that production email delivery works.

### Storage

The migration creates `bloom-media` with image MIME restrictions and a 15 MB bucket limit. Authenticated uploads must be stored under the signed-in user's UUID folder. The app compresses photos to WebP before upload. The public bucket is intentionally for social images only.

### Direct messages and Realtime

The migration creates `bloom_create_dm(target_user_id)`, a validated authenticated RPC that creates a private DM circle and adds the two participants. Messages are protected by circle-membership RLS. Enable `messages` and `notifications` in the `supabase_realtime` publication; the migration attempts to add them idempotently.

### Account deletion

Deploy the `delete-account` Edge Function with JWT verification enabled. Configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as server-side function secrets only. The function removes the user's files from the BLOOM buckets before deleting the Auth user. Do not add these secrets to GitHub or `bloom-config.js`.

## Local preview

Serve the repository root with any static HTTP server, for example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`. Camera access requires HTTPS or localhost and the user's browser permission.

## What still needs launch verification

The app code and database migration are an integrated starter implementation, not a claim that the service has completed production acceptance. Before inviting the public, test:

- Sign-up with email confirmation, sign-in, password reset, and the 3-interest onboarding with at least two separate accounts.
- Guest feed browsing and login gates for each restricted action.
- Camera permission, gallery upload, each Canvas filter, photo compression, public image retrieval, and upload-size enforcement on iOS and Android.
- Plant publishing, Heart/Sunlight counters, comments, reporting, blocking/unblocking, and private-profile visibility.
- Public circle joining, DM creation, both directions of live messaging, image messages, quick-share cards, and realtime reconnection.
- Notifications for Heart, Sunlight, comments, and post shares.
- Theme preference, profile editing, account privacy, password change, and full account deletion including file cleanup.
- Unauthorized reads/writes against every RLS-protected table and Storage path.

The migration deliberately avoids Supabase Pro-only dependencies. Existing Supabase plan limits still apply. The Garden Market, payments, recommendations ranking, push notifications, content-moderation staffing, and advanced follow requests are not included in this phase.
