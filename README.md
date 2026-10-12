# BLOOM — K-pop Community

BLOOM is a pastel pink and lavender K-pop community and fan-merch discovery website. The original single-page design and founder dashboard are retained.

## Files

- `index.html` — main GitHub Pages entry point.
- `bloom-enhancements.css` — additive responsive styles.
- `bloom-enhancements.js` — feed, wishlist, product-listing, messaging-preview, and Spotify dashboard enhancements.
- `bloom_kpop_community_launch_preview (1).html` — original launch preview, preserved separately.
- `bloom_ceo_dashboard.html` — original founder dashboard, preserved separately.

## Preview locally

Open `index.html` in a modern browser. For a local HTTP preview, run this from the repository folder:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## GitHub Pages

1. Review the feature branch and pull request before merging into `main`.
2. Open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/ (root)`, then save.
4. Wait for deployment and use the URL GitHub displays in **Settings → Pages**. The usual project-site URL format is `https://bloomiedceo.github.io/Bloom-Kpop-Community/`.

If Pages already publishes `main`, merging the reviewed pull request should trigger a deployment. You can select the feature branch for a temporary preview in Pages settings, but this changes the published branch; switch it back to `main` after testing.

## Included preview features

- Like/unlike, saved posts, fandom filtering, and a post composer.
- Marketplace search/category filtering, browser-local wishlist, and a demo product listing form.
- Fan-room messaging interface with local demo messages.
- BLOOM MUSIC dashboard with Spotify playlist embeds and a mini-player shortcut.
- Responsive styling for mobile and desktop.
- Existing preferences and original content/design preserved.

## Production limitations

GitHub Pages is static hosting. It does not provide a database, user authentication, server-side permissions, or real-time messaging. Likes, saved posts, posts, wishlists, demo listings, and demo messages are stored in this browser only; they are not shared with other visitors. Clearing browser data or changing devices can remove them. Do not enter passwords or sensitive information in this demo.

A real launch needs a secure backend for accounts, persistence, chat, media uploads, reporting/moderation, and account deletion. Replace demo shop links with verified affiliate or seller URLs and check prices and disclosures before launch.

Spotify playback uses Spotify's embed; availability and playback depend on Spotify, region, and account requirements. The mini-player is a shortcut to the music dashboard, not an independent audio player.

## Manual smoke-test checklist

- [ ] Load on desktop and a narrow mobile viewport.
- [ ] Search marketplace products and switch each category.
- [ ] Add/remove wishlist items and refresh.
- [ ] Like/unlike and save/unsave feed posts; test the saved-post filter.
- [ ] Create a post and refresh to verify browser-local persistence.
- [ ] Open fan rooms, switch rooms, and send a demo message.
- [ ] Open BLOOM MUSIC, switch Spotify playlists, and hide/show the mini-player.
- [ ] Check browser console and GitHub Pages deployment status.
