# BLOOM Launch Readiness — 16 October 2026

## Safety rule
Do not replace `main` or change the GitHub Pages publishing source until the intended NEW BLOOM build is confirmed and reviewed. The current `main` branch contains the older K-pop community site. Work on a feature branch and use pull requests.

## 1. Protect the default branch (owner action required)
In GitHub, open **BLOOM → Settings → Rules → Rulesets** (or **Settings → Branches → Add branch protection rule**, depending on the interface). Target branch `main` and enable:
- Require a pull request before merging (at least 1 approval if another trusted reviewer is available).
- Require status checks to pass before merging; select the actual CI check name only after it appears from a successful Actions run.
- Require conversation resolution.
- Block force pushes and branch deletion.
- Apply rules to administrators where practical.
- Do not require an approval from a second person if the repository is operated solo and GitHub cannot satisfy it; use the available safeguards without making the branch permanently unmergeable.

After saving, revisit the rule and verify it targets `main`. The connected GitHub tools available in this session do not expose the branch-protection/ruleset settings API, so this setting cannot be truthfully reported as enabled from here.

## 2. Prototype checks
Static checks run on the local combined prototype file on 2026-10-16:
- HTML parsed by Python's HTML parser.
- 76 IDs found; no duplicate IDs.
- Both inline JavaScript blocks pass `node --check`.
- The file contains 3 forms and 88 buttons, which still require interactive browser testing.
- This is static QA only. It does not prove that every button, cart state, checkout, currency conversion, mobile layout, or keyboard flow works end to end.

## 3. Required interactive test matrix
Run on desktop Chrome and a narrow mobile viewport; record pass/fail and a screenshot or console error for failures.

- [ ] All navigation links reach the correct section and modals open/close with Escape and backdrop click.
- [ ] Signup rejects missing/invalid required values and handles duplicate clicks.
- [ ] Forms show helpful validation and never claim data was sent when it was only previewed.
- [ ] Product search, category filters, wishlist, add/remove cart, quantity changes, totals, shipping/tax display, and receipt are consistent.
- [ ] Currency switch changes display formatting without repeatedly converting an already converted amount; label sample rates as illustrative.
- [ ] Language switch changes all advertised strings (not only navigation).
- [ ] Layout has no horizontal overflow at 320px, 375px, 390px, 768px, and desktop widths.
- [ ] Keyboard-only navigation, visible focus, reduced-motion preference, contrast, and screen-reader labels are checked.
- [ ] Reload behavior is clear: local demo state is local-only and never presented as shared server state.
- [ ] Browser console and network panel have no uncaught errors or missing required assets.

## 4. Backend readiness gates
The repository README documents a Supabase starter backend and migrations, but configuration and deployment must be verified in the owner-controlled Supabase project before launch:
- Confirm the exact Supabase project and redirect URLs.
- Review every table's RLS policies using anon, signed-out, normal-user, and moderator test identities.
- Verify email confirmation, sign-in, reset/recovery, session expiry, and account deletion using disposable test accounts.
- Confirm moderator privileges are server-controlled; never allow users to self-assign moderator roles.
- Keep service-role keys and Resend secrets only in server-side secrets. Never put them in browser JavaScript or commit them.
- Verify newsletter double-opt-in and unsubscribe only after the Edge Function and verified sender are configured.
- Test rate limiting/abuse protection, backup restoration, logging, and incident response.
- Do not claim DMs, uploads, push notifications, seller checkout, inventory, or real payments are live until implemented and tested.

## 5. Vendor pilot (no real payments until approved)
- Interview 5–10 potential vendors and a small group of buyers; validate demand, fees, shipping, returns, and support expectations.
- Start with a curated catalogue and manual, clearly disclosed fulfilment workflow.
- Use test-mode payments only after a suitable provider and marketplace payout model are selected and approved.
- Before accepting real orders, get guardian support where required, verify applicable Malaysian business/tax/privacy/consumer requirements, publish seller terms, refund/returns rules, prohibited-item rules, and a staffed safety/support route.
- Reconcile each order, seller share, platform fee, refunds, disputes, and payout before widening the pilot.

## 6. International expansion gates
Do not expand by country until local currency/pricing, shipping zones and delivery estimates, duties/taxes disclosures, returns, payment methods, seller eligibility, privacy requirements, moderation language coverage, and customer support are tested for that market.

## Status
This file is a plan, not proof that the branch rules, live backend, email delivery, payment provider, or browser/device tests have been completed. Update each checkbox only after collecting evidence.
