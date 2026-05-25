# myK9Show + myK9Q Unification — Design Plan

## Context

myK9Show and myK9Q currently feel like two separate products to end users, even though they share a database and live in the same monorepo. The audience is largely retired exhibitors with limited technical comfort — being told to use one app for entries and a different app at the show is friction we cannot afford.

Discovery showed that **both apps already have exhibitor-facing surfaces** (myK9Q has an `e****` exhibitor passcode role; myK9Show has `ShowDayPage`, `MyEntriesPage`, `ClassCheckInPage` with realtime ring alerts). The platform has two parallel show-day experiences that have never been reconciled. The risk is duplicated work, drifted behavior, and double-fired notifications.

This plan unifies the two apps under a single URL (`myk9show.com`) and a single notification pipeline, while preserving:
- The proven myK9Q passcode flow for stewards, judges, and exhibitors who never sign up
- The legacy `myk9q.com` deployment (untouched — continues to run the Access-integrated production app)
- myK9Show's account/career/entries experience

## Locked Decisions

1. **One URL for the new platform: `myk9show.com`.** `myk9q.com` stays pointed at the legacy app. The new monorepo myK9Q deployment goes away.
2. **Two doors, one room.** myk9show.com's landing offers equal-weight options:
   - **Sign in** (account holders)
   - **Use show passcode** (volunteer stewards, judges, non-account exhibitors)
3. **myK9Q's UI is absorbed into myK9Show as a route (`/at-show`) backed by a shared package.** No code duplication; the existing myK9Q app shell is retired.
4. **myK9Q's notification system wins.** It becomes a shared package consumed by both surfaces. myK9Show's `useShowDayAlerts` / `useNotificationStore` are retired, but the `isInRing` suppression idea is ported into the shared module.
5. **Fate of existing myK9Show show-day pages:**
   - **Keep** `MyEntriesPage` (pre-show "my upcoming entries across all shows" — belongs in the account home).
   - **Replace** `ShowDayPage` and `ClassCheckInPage` — the `/at-show` route (absorbed myK9Q UI) takes over the day-of experience.
6. **Account-holder show-day flow:** Sign-in is sufficient. If they have entries in a show happening today, a banner takes them to `/at-show` with their dogs **pre-favorited automatically** from their entries. They never type a passcode for a show they're entered in.
7. **Auto-favorite definition: owner OR handler.** Entries where the signed-in account is listed as either show up. Covers co-ownership and junior/pro handlers without surfacing unrelated dogs.

## Routing & Roles Summary

| Person | URL | Door | Lands on | Notification routing |
|---|---|---|---|---|
| Account exhibitor (entered today) | myk9show.com | Sign in | Banner → `/at-show` w/ dogs pre-favorited | Account-bound; targetable by armband or account |
| Account exhibitor (not entered) | myk9show.com | Sign in → "Use show passcode" | Manual favoriting | Per-favorite |
| Non-account exhibitor | myk9show.com | "Use show passcode" → `e****` | Ringside, manual favoriting (same as today) | Per-favorite |
| Steward (volunteer) | myk9show.com | "Use show passcode" → `s****` | Steward timer/check-in UI | Steward-specific alerts only |
| Judge | myk9show.com | "Use show passcode" → `j****` | Judge scoring UI | Judge-specific alerts only |
| Secretary | myk9show.com | Sign in | Workbench | Sender, not receiver, for show-day notifications |

## Messaging Architecture

The platform already has two complementary systems that solve different parts of the messaging problem. Unification means wiring them together, not replacing either.

**Existing inbox (myK9Show)** — `show_message_threads`, `show_messages`, `group_label` field for broadcasts. Secretary compose UI at `/secretary/messages/:showId` with per-exhibitor and per-class targeting via the `send-targeted-message` edge function. In-app + Supabase realtime; no push today.

**Existing push (myK9Q)** — `push_subscriptions` table, Web Push API, voice announcements, app badge. Transient (no persistence).

**Unified design:**

1. Secretary composes in the existing `SecretaryMessagesPage` — no new UI needed.
2. Message persists to `show_messages` (existing flow).
3. The `send-targeted-message` edge function is extended to **also fire push** via `push_subscriptions` to each recipient.
4. Push payload deep-links to the inbox thread.
5. **Smart suppression:** push only fires if the recipient is NOT currently in `/at-show`. If they're already in the app, only the inbox + realtime update fires. Extends the existing `isInRing` suppression pattern.
6. Two-way replies work as today (inbox is thread-based; participants can already reply). Replies notify the secretary via the same pipeline.

**Targeting (all four supported):**
- Per-exhibitor (existing 1:1 thread)
- Per-class (existing `sendTargetedMessage`)
- Per-checked-in (new — needs UI; can target via existing message infra)
- All-show broadcast (existing `group_label` infrastructure; UI is the small gap to close)

**Small gaps to close in the existing compose UI:**
- Expose "everyone checked in" target
- Expose "everyone in show" target (uses `group_label`)

## Branding

- Inside myk9show.com: zero "Q" references. The ringside experience is called "Ringside" or "At the show". Passcode flow is "Use show passcode".
- Onboarding/install copy mentions Q lineage once: *"the ringside experience you may know as myK9Q, now built right in."* — helps existing users find the feature without polluting the app.
- Legacy `myk9q.com` retains the Q identity externally (it's the Access-integrated production app, untouched).

## PWA Install

- **One PWA per device.** myk9show.com installs as "myK9Show" — single icon, single install prompt, single notification stream.
- Install prompt fires on the myK9Show homepage (not deferred), so account holders and passcode users both get prompted the same way.
- Existing myK9Q standalone PWA installs become orphaned when that deployment sunsets — addressed in Phase 4 migration copy.

## Critical Files & Locations

**myK9Show (existing, to be modified):**
- `apps/myk9show/src/routes/publicRoutes.tsx` — add `/at-show` route, retire `ShowDayPage` / `ClassCheckInPage` routes
- `apps/myk9show/src/pages/ShowDayPage.tsx`, `apps/myk9show/src/pages/ClassCheckInPage.tsx` — delete after `/at-show` is live
- `apps/myk9show/src/pages/MyEntriesPage.tsx` — **keep** (belongs in account home)
- `apps/myk9show/src/features/messages/pages/SecretaryMessagesPage.tsx` — extend with "everyone checked in" + "everyone in show" targets
- `apps/myk9show/src/store/messageStore.ts` — wire to shared notification package
- `apps/myk9show/src/hooks/useShowDayAlerts.ts`, `useNotificationStore.ts` — delete after shared module is in place

**myK9Q (existing, to be extracted):**
- `apps/myk9q/src/contexts/AuthContext.tsx`, `apps/myk9q/src/utils/auth.ts` — passcode + role-prefix logic → extract to shared package
- `apps/myk9q/src/pages/Login/Login.tsx`, `apps/myk9q/src/pages/Home/Home.tsx` — UI → consumed via shared package
- myK9Q notification service (push subscription mgmt, voice announcements) → extract to shared package

**Supabase (existing, no schema changes for phase 0–4):**
- `show_messages`, `show_message_threads`, `push_subscriptions` — reuse as-is
- `send-targeted-message` edge function — extend to fan out push subscriptions

## Implementation Phases

### Phase 0 — Extract & share (foundation)
1. Create `packages/ringside` (or similar) containing extracted myK9Q UI, auth/passcode logic, and the shared notification module.
2. Port the `isInRing` suppression idea from myK9Show's `useNotificationStore` into the shared notification module.
3. Have the existing `apps/myk9q` app consume the new package — verify it still builds and behaves identically.
4. **Tests:** unit tests for passcode role parsing, push suppression logic, owner-or-handler favorite resolver. Must be green before Phase 1.

### Phase 1 — `/at-show` route in myK9Show
1. Add `/at-show` route to `apps/myk9show/src/routes/publicRoutes.tsx`, rendering the shared ringside package inside myK9Show's app shell.
2. Add homepage two-door landing: equal-weight "Sign in" and "Use show passcode" CTAs.
3. Wire the passcode flow into myK9Show's auth context so it coexists with the account session.
4. **Tests:** Playwright spec exercising both doors (passcode `s****`, passcode `e****`, passcode `j****`, account sign-in). Unit tests for the homepage door-router logic.

### Phase 2 — Account-holder show-day auto-routing
1. Implement "Show today" banner on myK9Show homepage that appears when the signed-in account has at least one entry in a show happening today.
2. Implement auto-favorite logic: on banner-tap or `/at-show` mount, pre-favorite entries where the account is owner OR handler.
3. **Tests:** unit tests covering owner-only, handler-only, owner+handler, co-ownership, and zero-entry edge cases. Playwright spec covering banner appearance + auto-favorite assertion.

### Phase 3 — Unified messaging pipeline
1. Extend `supabase/functions/send-targeted-message` to fan out push notifications via `push_subscriptions` after writing to `show_messages`.
2. Apply suppression: skip push if the recipient's last-seen session is in `/at-show` (or in-ring per existing `isInRing` flag).
3. Push payload deep-links to the inbox thread.
4. Add "Everyone checked in" and "Everyone in show" target options to `SecretaryMessagesPage`'s `ComposeTargetedModal`.
5. **Tests:** edge function unit tests (per-exhibitor, per-class, per-checked-in, all-show targets each fan out correctly). Suppression tests. E2E: secretary composes → exhibitor receives push → tapping push opens correct inbox thread.

### Phase 4 — Retire duplicated surfaces
1. Delete `ShowDayPage`, `ClassCheckInPage`, `useShowDayAlerts`, `useNotificationStore` and their route entries.
2. Keep `MyEntriesPage`.
3. Sunset the standalone myK9Q vercel deployment. Add a banner/redirect on `myk9-platform-myk9q.vercel.app` pointing to myk9show.com.
4. Update PWA manifest in myK9Show to single "myK9Show" identity.
5. **Tests:** confirm no orphaned imports, no broken routes; CI typecheck + lint pass clean.

### Phase 5 — Branding & onboarding copy
1. Add homepage copy hinting at Q lineage: *"the ringside experience you may know as myK9Q, now built right in"*.
2. Audit and remove all "myK9Q" string references inside the unified app surface (search for "myK9Q", "myk9q", "MyK9Q").
3. Update install prompt copy for the at-show audience.
4. **Tests:** snapshot test of homepage copy; grep test in CI to prevent regression of removed strings.

### Phase 6 — Delete `apps/myk9q`
Once Phase 4 has sunset the deployment and the pilot + clean show have validated `/at-show`, the standalone app directory becomes architectural debt: ongoing CI cost, lint/typecheck overhead, and "is this still real?" mental overhead. Its independent-app value (separate URL, separate PWA, separate bundle) is eliminated by the unification.

1. Confirm `packages/ringside` is consumed only by `apps/myk9show` (no remaining `apps/myk9q` imports of anything outside the package).
2. Delete `apps/myk9q/` directory.
3. Remove `apps/myk9q` from `pnpm-workspace.yaml`, root `package.json` scripts (`dev:q`, `test:q`, etc.), turbo pipeline configs, and any CI workflow references.
4. Delete the `myk9-platform-myk9q.vercel.app` Vercel project (after confirming no live PWA installs are still hitting it — at least 30 days post-Phase-4 redirect).
5. Update `CLAUDE.md` to remove `apps/myk9q` references (commands, deployment table, architecture decisions section).
6. **Tests:** full monorepo `pnpm build`, `pnpm typecheck`, `pnpm lint`, and `pnpm test` pass cleanly. No dangling references via `grep -r "apps/myk9q"`.

### Out of scope for this plan
- Touching legacy `myk9q.com` (separate repo, Access-integrated, untouched).
- Schema changes to `show_messages` or `push_subscriptions`.
- Replacing the existing exhibitor inbox UI design.

## Verification

**End-to-end walks (Playwright, one spec per persona):**
1. **Account exhibitor entered today:** sign in → see "Show today" banner → tap → `/at-show` loads with dogs auto-favorited → secretary sends class message → push fires → tapping opens inbox thread.
2. **Account exhibitor not entered:** sign in → no banner → tap "Use show passcode" → type `e****` → manual favoriting.
3. **Volunteer steward:** anonymous → tap "Use show passcode" → type `s****` → land on steward UI.
4. **Judge:** anonymous → tap "Use show passcode" → type `j****` → land on judge UI.
5. **Secretary:** sign in → workbench → compose message → pick "Everyone checked in" → verify recipients + push fanout.

**Suppression check:** open `/at-show` in browser → secretary sends targeted message → assert inbox updates but no push fires for that session.

**Regression:** smoke-test legacy `myk9q.com` is unaffected (DNS check; not in this repo).

**Unit tests:** owner-or-handler resolver, passcode role parsing, push suppression logic, edge function fanout.

**Manual UAT:** older user representative walks the account-holder flow and the passcode flow end-to-end on a phone; confirms no "where do I go?" moments.

## Rollout

- Phases 0–2 ship behind a feature flag (`unified_ringside_enabled`) per user account / show. Pilot with one club's show before global enable.
- Phase 3 messaging changes ship enabled (push is additive; no behavior loss).
- Phase 4 sunset happens after the pilot show plus one more clean show — gives time to catch regressions before the legacy surfaces go away.
- Phase 5 copy/branding ships independently and is safe to revert.
- Phase 6 deletion waits at least 30 days after the Phase 4 redirect is live, so any stale PWA installs have a chance to land on the redirect and be migrated before the target deployment disappears.
