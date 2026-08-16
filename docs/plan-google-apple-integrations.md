# myK9Show — Google & Apple Integration Roadmap (v3, codebase-corrected)

> **Status:** Active

Revised from v2 after verifying claims against the codebase. Six integrations ship at launch; wallet passes become a data-gated fast-follow. Several v2 estimates were built on wrong assumptions about what already exists — corrections are marked **[corrected]** and mostly shrink the work: the launch set is ~2.5 weeks, not 4. The freed week goes to Stripe Connect hardening, per the standing constraint.

Stack: React + Vite PWA, Supabase (Postgres / Edge Functions / Realtime / Auth), Stripe Connect. No native app.

Fee model: 7% total convenience fee, ~3% net platform margin after Stripe processing.

**Standing constraint:** nothing in this document outranks Stripe Connect. If a week is contested, Connect wins.

---

## Do this week (before any code)

Two items have external lead times that will gate you later if started late. Both are cheap and run in the background.

| Item | Cost | Lead time | Why now |
|---|---|---|---|
| **A2P 10DLC brand + campaign registration** | ~$50 setup, $1.50–10/mo | 1–3 weeks approval | Buys the *option* on SMS. Unregistered messages are blocked outright by carriers. Skipping this means a month's delay whenever you decide you want it. |
| **Google Cloud project + Maps API key + billing account** | $0 | Same day | Required even at zero usage. Set a $10/mo budget alert immediately. |

Optionally also: **Google Wallet issuer account application.** Free, approval is not instant, and having it approved costs nothing if you never use it.

---

## Launch set — ships with v1

Estimated **~2.5 weeks** of evening and weekend work **[corrected from ~4 — L1 is half done, L2 is dashboard config only, L4's delivery pipeline already exists]**, in this order.

### L1. Sign in with Apple (Google Sign-In already shipped)
**~Half a day.** **[corrected]** Google OAuth is already implemented — `signInWithGoogle` in `apps/myk9show/src/hooks/useAuth.ts` via Supabase Auth, with tests. Only Apple is new: a Services ID and key from the Apple Developer portal, enable the provider in Supabase, add the button next to the existing Google one.

*Exhibitor benefit:* removes password creation, the highest-abandonment step for someone entering four trials a year.

*Urgency note:* Sign in with Apple is not a compliance requirement for a PWA — that guideline binds App Store submissions. But because Google sign-in is live, **Google-identity accounts are accumulating today**, and retrofitting Apple after iOS users have created Google or password accounts is the painful path. This is the reason L1 stays first despite being small.

### L2. Apple Pay & Google Pay
**~1 hour of dashboard configuration + device testing. No code change.** **[corrected again during implementation]** The app uses hosted **Stripe Checkout Sessions**, and on hosted Checkout the `card` payment method type automatically carries Apple Pay and Google Pay — no integration changes, and no Apple Pay domain registration (that requirement is for Payment/Express Element on your own domain).

The `payment_method_types: ['card']` pin in `stripe-checkout/index.ts` **stays**. It is a deliberate money-path contract (`moneyPathCloseout.source.test.ts`): asynchronous methods like ACH and Klarna complete Checkout with `payment_status: 'unpaid'` and settle later, which `decideFreshSessionGate` refuses by design. Wallets are card-network payments and are unaffected by the pin. v2 and the first v3 draft both got this wrong; the pin site now carries an `// INTENT:` comment.

The actual work:

1. Stripe dashboard → Payment methods: confirm **Apple Pay** is enabled (on by default) and enable **Google Pay** (off by default).
2. Verify wallet buttons appear on the hosted Checkout page in test mode on iOS Safari and Android Chrome.

**Highest ROI item in this document.** Same processing rate as a card, materially lower mobile cart abandonment, and your entries happen on phones.

### L3. Maps — Places Autocomplete + Static Maps
**~1 day remaining.** **[corrected during implementation]** "Greenfield" was wrong — the app already carries a substantial free-tier maps stack: a Leaflet/OSM `VenuePinMap` in the show wizard with a draggable pin and Nominatim geocoding on the address, a shows-browse map view, venue `latitude`/`longitude` columns flowing through `create_show_with_children`, and a Google **Maps Embed API** `VenueMap` on the show overview (keyless fallback, `VITE_GOOGLE_MAPS_EMBED_API_KEY`). L3 narrows to the two pieces that stack doesn't cover:

- **Places Autocomplete** on the wizard's venue Location field — **built.** `VenueAddressAutocomplete` (features/maps) suggests venues/addresses via Places API (New) with per-session billing tokens; selecting one fills the field and drops the map pin from Google's coordinates. Gated on `VITE_GOOGLE_MAPS_API_KEY`: without a key the field renders exactly as before (plain textarea + Nominatim "Locate"). Suggestions render in-flow, not as an anchored popup, per the `noHandRolledDropdowns` guard.
- **Static Maps** image in the premium list and entry confirmation email — **remaining.** Note the confirmation email has 7 style templates (`send-confirmation-email/*-email.ts`), each with its own venue block and parity tests, so this is a shared-helper-plus-seven-insertions job, not one edit. No JS, no map-load billing, renders inside email clients.

*Financial:* Essentials SKUs carry 10,000 free events per month each and free usage no longer pools across SKUs. Comfortably free at launch volume. Session tokens are implemented — Autocomplete bills per session, not per keystroke, and the client mints one token per typing session, consumed by the terminating Place Details call.

*Deferred:* interactive Dynamic Maps, the drag-and-drop ring layout canvas, geofencing. Good ideas; none answer "can a secretary run their first trial without this."

### L4. Web Push — "you're N runs out" proximity alert
**~2–3 days.** **[corrected from ~1 week]** The delivery pipeline already exists and is deployed: `supabase/functions/send-push-notification` uses standards-based Web Push (`web-push` + VAPID keys), with six `push-trigger-*` functions (class status, scoring, announcements, chat, waitlist, support) already invoking it. Standards Web Push covers Chrome/Android (FCM is merely the transport) **and** iOS 16.4+ installed PWAs — there is no separate FCM or APNs integration to build.

The genuinely new work:

- The **run-proximity trigger**: compute "N runs out" from run order + class progress and fire through the existing `send-push-notification` path, following the established `push-trigger-*` pattern.
- **Instrument the iOS PWA install rate from day one.** iOS Safari only permits web push if the app has been added to the home screen. That single number determines whether SMS is necessary or a luxury, and whether the native-app question ever needs answering.

*Exhibitor benefit:* the actual killer feature. Missing your run because you were at the crate is the sport's universal frustration.

### L5. Calendar — .ics + webcal feed
**~3 days.** Skip the Google Calendar API and Apple EventKit entirely.

- Downloadable `.ics` per entry — one code path covers Google, Apple, and Outlook
- `webcal://` subscription feed per exhibitor per trial, so estimated run times shift automatically as judging runs ahead or behind

Cheaper to build than the API approach and strictly more capable. No OAuth scopes to justify.

**Security design is part of the feature, not an afterthought.** **[added]** A per-exhibitor subscription URL is an unauthenticated capability token fetched by Google/Apple calendar servers — it cannot carry a session. Requirements:

- The feed token must be a high-entropy random value stored server-side (revocable per exhibitor), not a guessable or derivable ID.
- The feed exposes **run schedule data only** — class, ring, estimated time. Never entry status, payment fields, or anything on the anon-sensitive list this project has repeatedly tightened (MYK9-93 lineage).
- Serve it from an Edge Function with its own narrow read path; do not widen any anon table grant to feed it.

### L6. SMS alerts — "you're 3 dogs out"
**~3 days of development.** The constraint is 10DLC approval (calendar time), not build time. Ships at launch only if the registration started in week one.

**Why carry SMS at all when push is nearly free:** **[added]** ringside is exactly where this app is offline-first because venue connectivity is bad. Carrier SMS delivers where the exhibitor's data connection won't. That — not reach on uninstalled PWAs — is the real justification for the compliance overhead.

**Scope tightly:** the pre-run alert only. Not results, not schedule changes. Keep messages under 160 characters and avoid emoji — emoji forces UCS-2 encoding, dropping the limit to 70 characters and doubling cost.

*Cost:* ~$0.012–0.013 per message all-in including carrier passthrough. Roughly 4–5 cents per exhibitor per trial.

**Give it away.** Against a $7 fee on a $100 cart, a nickel is under 1% of margin. "We text you before your run" is worth more as word-of-mouth in a small, tightly networked sport than as a $4.99/mo subscription — which is an awkward sell to someone competing six weekends a year. Revisit paid tiering in Year 2 if volume justifies it.

**Consent is not optional — and the trap already exists in the code.** **[corrected]** `apps/myk9show/src/types/user-preferences.ts` already carries a bare `notifications.sms: boolean`. That is exactly the shape TCPA makes indefensible: no timestamp, no consent-text version, no source. Do **not** reuse it as the consent record. L6 includes a migration adding `sms_opt_in_at`, the consent text version, and the opt-in source, plus automatic STOP/HELP handling. The existing boolean may remain as a display preference only.

---

## Testing phase — launch set is not done until these pass

Required by project policy; each item gates its integration.

- **L1:** Apple sign-in round-trip on a real iOS device; account-linking behavior verified when the same email exists as a Google-identity account (document the observed behavior, don't assume).
- **L2:** Stripe test mode on iOS Safari (Apple Pay) and Android Chrome (Google Pay); confirm the wallet buttons render on the hosted Checkout page and a wallet test charge settles through the existing `stripe-webhook` path as an ordinary card payment; confirm `moneyPathCloseout.source.test.ts` still passes (card-only pin intact).
- **L3:** with a real key on staging: suggestions appear in the wizard Location field, selection drops the pin, and the Google Cloud billing console shows one Autocomplete session per address entry (not per keystroke); without a key the field behaves exactly as before. Static Maps image renders in Gmail and Apple Mail clients, not just the browser.
- **L4:** push received on an **installed** iOS 16.4+ PWA and on Android Chrome; proximity trigger fired from a seeded class run-order fixture; unit tests for the "N runs out" computation. Run new vitest files with `--sequence.shuffle` 6+ times and register them in the appropriate config allowlist (project rule — new test files do not auto-run in CI).
- **L5:** generated `.ics` validates and imports on Google Calendar, Apple Calendar, and Outlook; webcal feed refreshes an updated run time; feed token 404s after revocation; verify the feed response contains no payment/status fields.
- **L6:** TCPA round-trip on a real handset: opt-in stores timestamp + text version + source; STOP halts sends and is recorded; HELP responds; message stays GSM-7 (no emoji) under 160 chars.

---

## Fast-follow — 60–90 days post-launch

Held back deliberately. Combined these are 5–6 weeks of work for a feature whose audience you can't yet size.

### F1. Google Wallet digital armband
**~2 weeks.** Pass class and object via REST, signed JWT for the add button, updates via REST `PATCH` — no per-pass signing.

- Front: armband number, dog call name, class/element/level, ring assignment
- Back: run history, search times, qualifying legs toward title
- QR: entry ID for gate check-in scanning

**Gate:** iOS/Android split of your actual exhibitor base, measured from Phase L4 push analytics or your existing WooCommerce customer data. **This is the only gate.** **[corrected]** v2 claimed a schema prerequisite ("a proper `dogs` table… `dog_name` denormalized as text"). That was wrong: `dogs` has existed since migration 001 with registration-number fields, every results/entries table FKs `dog_id`, and the multi-registry layer normalized registration numbers into `dog_registrations` (June–July 2026). Title-leg tracking on the pass back is buildable against the schema as it stands today.

**Sequencing caveat:** Google Wallet has no iOS app. If your base runs 65–70% iPhone — plausible, given dog sport exhibitors skew older — then building Google first means validating against the minority. In that case build Apple Wallet first and treat Google as the follow-on, inverting F1 and F2.

*Phase-policy note:* **[added]** a wallet pass duplicates the existing armband/at-show surface, which is why it is deferred behind measured demand rather than shipped speculatively — consistent with the consolidate-don't-duplicate rule.

### F2. Apple Wallet passes
**~3–4 weeks.** $99/yr Apple Developer Program.

Signed `.pkpass` bundles requiring a Pass Type ID certificate (`passkit-generator` handles bundling on Node). The expensive part: **push updates require hosting a pass web service** — device registration endpoints, APNs push, then a fetch endpoint the device calls back to. That's a real service on Edge Functions, not a webhook.

**Kill criterion:** if the first-built platform shows a pass-add rate under 20%, cancel the second. Exhibitors will have told you they don't want it, and you've recovered a month for Connect hardening.

**Fast-follow testing:** pass renders and updates end-to-end on a physical device for the built platform; stale-result scenario explicitly tested (score posted while device offline, pass refreshes on reconnect); gate-scan QR read by a second device.

---

## Year 2

### Y1. Google Drive backup for secretaries
**$0.** Automatic export of catalogs, score sheets, and AKC/UKC submission files to the secretary's own Drive. Secretary-facing retention play — clubs rotate secretaries, and a club whose records live in their own Drive stays.

No Apple equivalent exists; CloudKit writes to your app's container, not a user's iCloud Drive. Offer a manual `.zip` download for non-Google clubs.

### Y2. Paid tier reconsideration
If SMS volume and exhibitor engagement justify it, an annual VIP tier ($19–29/yr) bundling title tracking, training journal, and performance analytics. Annual, not monthly — match the rhythm of the sport.

---

## Never (unless triggered)

**Native iOS app / Live Activities / Dynamic Island.** ActivityKit is native-only and unavailable to PWAs. Building it means App Store review, release cycles, and two codebases.

*Trigger, if ever:* iOS PWA install rate below 25% **and** SMS costs above $500/mo.

*The financial argument is stronger than the technical one:* any subscription sold through the App Store loses 15–30% to Apple. On a $4.99/mo tier that's $0.75–1.50 per subscriber per month. Web-only checkout keeps 100%. Treat this as a decision to actively avoid.

---

## Cut entirely

| Feature | Reason |
|---|---|
| **Google Find Hub** | No app-facing API. It's a hardware certification program for tracker manufacturers requiring certified chipsets and third-party lab testing. |
| **Apple iCloud Drive API** | Doesn't exist for third parties. CloudKit is app-container only. |
| **Google Messages / RCS** | No direct API, and no iOS app at all. Available via CPaaS with heavier sender verification than SMS. Revisit Year 3 at earliest. |
| **Google Pay as a separate integration** | Covered by Stripe Checkout in L2. |
| **Google Calendar API / Apple EventKit** | `.ics` + webcal achieves more, cross-platform, with no OAuth. |
| **FCM / APNs SDK integration for push** | **[added]** Already unnecessary — the deployed `send-push-notification` function speaks standards Web Push (VAPID), which both platforms accept. |

---

## Cost summary at 50 trials/year, ~3,000 entries

| Item | Annual cost |
|---|---|
| Auth, Maps, wallet payments, push, calendar | $0 |
| SMS (~12k messages + campaign fees) | ~$250–400 |
| Apple Developer Program (fast-follow) | $99 |
| Google Wallet, Drive backup | $0 |
| **Total** | **~$350–500/yr** |

At a $100 average cart, 3,000 entries is roughly $75,000 gross and ~$2,700 platform margin. Integration costs land near 15% of margin — and every launch-set item except SMS is free.

---

## What the deferral actually buys

The two held items are the two that consume the most time for the least certain return. Beyond the calendar math, two arguments:

**Launch surface area is risk.** Every integration is something that can break in front of your first club. A first trial where a wallet pass shows a stale result is worse than a first trial with no wallet pass. You have ~100 warm contacts and a name in this sport built over twelve years — that reputation is the asset the whole retirement plan rests on.

**Connect is the loud failure.** It's the highest-risk remaining build item and the one that fails with real money in front of real clubs. The ~1.5 weeks these corrections freed from the launch set is not schedule slack — it is Connect hardening time, by the standing constraint at the top of this document.

This isn't a two-year stretch. It's one deferral, made on measured data rather than a guess about which phone your exhibitors carry.
