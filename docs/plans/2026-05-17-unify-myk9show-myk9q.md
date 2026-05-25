# myK9Show + myK9Q Unification — Design Plan

> **Status:** Active (consolidated 2026-05-25)
> **Risk profile:** High — touches auth, DB schema, push notifications, routing, offline/ringside data path, and ends with deleting an app
> **Validation profile:** Full — every phase requires unit + integration + Playwright + manual UAT before advancing; security review required on Phase 1 (smart input + rate limiting) and Phase 3a/3b (RPC + edge function authz); migration review required on Phase 0, Phase 1, Phase 3a/3b schema changes; pilot show + one clean show required before Phase 4 sunset
> **Supersedes:** `2026-05-25-unify-addendum-smart-input.md` (merged into Locked Decision #2 and Phase 1)
> **Review history:** three rounds — initial verify (2026-05-25), reviewer findings on suppression/admin/legacy/co-owner/fanout/access-card (2026-05-25 rev 1), reviewer findings on schema specificity (2026-05-25 rev 2), reviewer findings on legacy-passcode distribution risk + validation profile (2026-05-25 rev 3)

## Context

myK9Show and myK9Q currently feel like two separate products to end users, even though they share a database and live in the same monorepo. The audience is largely retired exhibitors with limited technical comfort — being told to use one app for entries and a different app at the show is friction we cannot afford.

Discovery showed that **both apps already have exhibitor-facing surfaces** (myK9Q has an `e****` exhibitor passcode role; myK9Show has `ShowDayPage`, `MyEntriesPage`, `ClassCheckInPage` with realtime ring alerts). The platform has two parallel show-day experiences that have never been reconciled. The risk is duplicated work, drifted behavior, and double-fired notifications.

This plan unifies the two apps under a single URL (`myk9show.com`) and a single notification pipeline, while preserving:
- The proven myK9Q passcode flow for stewards, judges, admins, and exhibitors who never sign up
- The legacy `myk9q.com` deployment (untouched — continues to run the Access-integrated production app)
- myK9Show's account/career/entries experience

## Locked Decisions

1. **One URL for the new platform: `myk9show.com`.** `myk9q.com` stays pointed at the legacy app. The new monorepo myK9Q deployment goes away.

2. **One smart input, not two doors.** The myk9show.com landing has a single credential field that accepts either an account email or a show passcode. The form disambiguates client-side as the user types and routes through the correct flow without an upfront choice. Detection rules:
   - Input contains `@` → email branch → step 2 reveals password → Supabase Auth sign-in
   - Input matches passcode shape (see "Passcode format" below) → submit immediately → passcode session, route by role
   - Anything else → friendly invalid-input error with format example
   Replaces the earlier two-door landing pattern (rejected during design review for imposing a choice point on the older volunteer/judge persona).

3. **myK9Q's UI is absorbed into myK9Show as a route (`/at-show`) backed by a shared package.** No code duplication; the existing myK9Q app shell is retired.

4. **myK9Q's notification system wins.** It becomes a shared package consumed by both surfaces. myK9Show's `useShowDayAlerts` / `useNotificationStore` are retired, but the `isInRing` suppression idea is ported and extended (see Phase 3b for the durable presence model that replaces client-only state).

5. **Fate of existing myK9Show show-day pages:**
   - **Keep** `MyEntriesPage` (pre-show "my upcoming entries across all shows" — belongs in the account home).
   - **Replace** `ShowDayPage` and `ClassCheckInPage` — the `/at-show` route (absorbed myK9Q UI) takes over the day-of experience.

6. **Account-holder show-day flow:** Sign-in is sufficient. If they have entries in a show happening today, a banner takes them to `/at-show` with their dogs **pre-favorited automatically** from their entries. They never type a passcode for a show they're entered in.

7. **Auto-favorite predicate (server-enforced, RLS-protected RPC):**
   The RPC is `get_account_today_entries()` — **no parameters**. It derives `person_id` from `auth.uid()` internally; the caller cannot pass an account id. Predicate:
   ```sql
   entries.handler_id = $person_id (from auth.uid())
   OR dogs.owner_id    = $person_id
   OR dogs.co_owner_id = $person_id
   ```
   scoped to shows happening today. Returns empty when unauthenticated rather than erroring. Covers co-ownership and junior/pro handlers without surfacing unrelated dogs. The client never receives unauthorized entry IDs and cannot impersonate another account by passing a different id.

8. **Session precedence:** when a signed-in account enters a passcode in the smart input, the passcode role is granted *in addition to* the account session, scoped to that single show. The passcode does not impersonate the account; it temporarily expands role. Account session remains the source of truth for identity, audit trails, and push subscription ownership. UI confirms before attaching: *"You're signed in as [name]. Use this passcode to join [show] as a [role]?"*

9. **Multi-show-today banner:** if the account has entries in >1 show today, the banner becomes a stacked list (one row per show) ordered by earliest class time. Single show → single CTA. Zero shows → no banner.

10. **Schema changes are required.** The original "no schema changes for phases 0–4" assumption is dropped. The current `push_subscriptions` table has only `id, user_id, endpoint, p256dh, auth, license_key, created_at` — no columns for role, per-show favorites, or presence. Phase 3b adds a new sibling table `ringside_sessions(subscription_id, show_id, role, favorited_armbands, last_seen_at, last_seen_route)` keyed on `(subscription_id, show_id)`. This separates per-device push state (which is durable across shows) from per-show ringside state (which is bounded to a single event). The fanout query joins `push_subscriptions → ringside_sessions` to resolve passcode recipients.

11. **Write path for `ringside_sessions` is via a `SECURITY DEFINER` RPC, not direct table writes.** Anonymous passcode users have no `auth.uid()`, so account-based RLS would lock them out of writing — and they are the headline persona. The RPC `upsert_ringside_session(passcode_or_null, subscription_endpoint, show_id, favorited_armbands, route)` runs with elevated privileges, validates the credential (passcode against `mobile_app_lic_key` OR `auth.uid()` against the subscription's `user_id`), derives `license_key` + `role`, and upserts. Direct INSERT/UPDATE on `ringside_sessions` is denied to all client roles; only the RPC and the service-role edge function can write. This unifies the write path for both account and passcode identities behind a single validated entry point.

## Passcode format (canonical)

The smart input and the underlying parser must agree on what a passcode looks like. Existing code has two formats in play:

- **myK9Q (`apps/myk9q/src/utils/auth.ts:72`)** accepts both legacy `myK9Q1-d8609f3b-d3fd43aa-6323a604` (4-part) and UUID (5-part) license keys, deriving 5-char passcodes from them.
- **myK9Show (`apps/myk9show/src/utils/passcodes.ts:17`)** only derives from UUID.

**Phase 0 prerequisite (blocking):** decide between:

- **(A) Widen the parser to accept both formats.** `apps/myk9show/src/utils/passcodes.ts` derives passcodes from both legacy `myK9Q1-...` and UUID shapes. No existing codes are invalidated. Simpler rollback. **This is the default choice.**
- **(B) One-time data migration converting legacy license keys to UUID, re-deriving passcodes.** Cleaner long-term, but **invalidates any passcodes already in circulation**. If a secretary has printed access cards, distributed codes via email, or given exhibitors paper handouts, option B silently breaks all of them.

**Hard prerequisite for choosing B:** prove no legacy-format codes are currently distributed by auditing:
1. `mobile_app_lic_key` rows: how many are legacy format vs. UUID?
2. Show calendar: are any upcoming shows using legacy-format keys?
3. Secretary outreach: have access cards been printed/sent for any active or near-future show?

If any of these surface live legacy codes, choose A. If you must choose B despite live codes, the migration must:
- Land a transition window of at least 60 days where both legacy and new derivations are accepted in parallel.
- Notify affected secretaries with the new codes and a re-issue instruction.
- Document a per-show rollback path (revert that show's `mobile_app_lic_key` to legacy, since the migration is per-row).

**Recommendation: default to A.** B is only worth the risk if the legacy set is provably small AND not actively distributed. Document the decision and the audit results in the Phase 0 PR.

After resolution: 5-character passcode, first char in `{a, j, s, e}` (admin, judge, steward, exhibitor), remaining four lowercase alphanumeric. Case-insensitive on input (normalize to lowercase before detection).

## Routing & Roles Summary

| Person | URL | Credential | Lands on | Notification routing |
|---|---|---|---|---|
| Account exhibitor (entered today) | myk9show.com | Email → password | Banner → `/at-show` w/ dogs auto-favorited | Account-bound; targetable by armband or account |
| Account exhibitor (not entered) | myk9show.com | Email → password, then types passcode | Manual favoriting | Per-favorite |
| Non-account exhibitor | myk9show.com | Passcode `e****` | Ringside, manual favoriting | Per-favorite (mapped via license_key + favorites) |
| Steward (volunteer) | myk9show.com | Passcode `s****` | Steward timer/check-in UI | Steward-specific alerts only |
| Judge | myk9show.com | Passcode `j****` | Judge scoring UI | Judge-specific alerts only |
| **Admin** | myk9show.com | Passcode `a****` | Admin/show-management UI (existing myK9Q admin surface, retained) | Admin-broadcast alerts |
| Secretary | myk9show.com | Email → password | Workbench | Sender, not receiver, for show-day notifications |

## Smart-Input UX

**Live disambiguation copy under the input.** As the user types:
- `> Looks like an email — we'll ask for your password next`
- `> Looks like a show passcode — you'll be signed in`

In an `aria-live="polite"` region so screen readers announce the change.

**Discoverability copy below the input** (static, shown before the user types anything):
> Have an account? Use your email.
> Working a show? Use the passcode your secretary gave you (5 characters).

**A "Learn how it works" link** → `/help/credentials` (new docs page created in Phase 1; broken link is a Phase 1 ship blocker).

**No "Forgot password?" link on step 1.** Only on step 2 of the email branch.

**Normalization on submit:**
- Trim leading/trailing whitespace and zero-width chars (`​`, `﻿`).
- Lowercase the entire input.
- Reject internal whitespace/newlines with the standard invalid-input error.

**Mobile keyboard hint.** Default `inputmode="email"`; the form re-evaluates as the user types so passcode entry isn't blocked by the wrong keyboard layout.

**Submit gating.** Submit button is `disabled` + `aria-disabled="true"` until input matches either shape. Pressing Enter on invalid input surfaces the standard error rather than firing a request.

**Autocomplete attributes** (for password-manager compatibility — verified manually with 1Password, Bitwarden, iOS Keychain, Chrome Password Manager during Phase 1):
- Step 1: `autocomplete="username"`
- Step 2 password: `autocomplete="current-password"`

**Focus management.**
- Step 2 password field gets programmatic focus on reveal.
- Invalid submit keeps focus on the input with `aria-invalid="true"` and `aria-describedby` pointing at the error element.
- All transitions announced via `aria-live`.

**Error state for unrecognized input:**
> That doesn't look like an email or a show passcode. Passcodes are 5 characters and start with a letter — for example, `aa260`.

## Security (smart input)

1. **Rate limiting:** the passcode endpoint enforces per-IP and per-device limits — 10 attempts per 5 minutes, then exponential backoff. Email sign-in inherits Supabase Auth's built-in limiting.
2. **Enumeration resistance:** API returns a single generic error ("That credential wasn't recognized") for any of "no such email", "wrong password", "no such passcode", "expired passcode". Response timing normalized to a 250ms minimum (constant-time compare on passcode lookup).
3. **Captcha fallback:** after 3 consecutive invalid submits in a session, surface a Cloudflare Turnstile (confirm it's already in use elsewhere before assuming — fallback is a different provider).
4. **Brute-force surface:** the 5-char passcode namespace is ~6.7M values; rate limiting + per-show passcode expiry bound the practical attack surface. Document this in the security review.

## Analytics

To validate the "no choice point" design, instrument:
- `landing_input_typed_first_char`
- `landing_input_disambiguated` (payload: `branch: "email" | "passcode" | "invalid"`)
- `landing_submit_attempted` (payload: `branch`, `valid: bool`)
- `landing_invalid_submit_count`
- `landing_submit_success` (payload: `branch`, `elapsed_ms`)
- `landing_help_link_clicked`

**Success metric:** <2% of sessions hit `landing_invalid_submit_count >= 2`. If we exceed that in the pilot, the smart-input is failing for the older persona and we revisit.

## Messaging Architecture

The platform has two complementary systems that solve different parts of the messaging problem. Unification means wiring them together, not replacing either.

**Existing inbox (myK9Show)** — `show_message_threads`, `show_messages`, `group_label` field for broadcasts. Secretary compose UI at `/secretary/messages/:showId` with per-exhibitor and per-class targeting via the `send-targeted-message` edge function. In-app + Supabase realtime; no push today.

**Existing push (myK9Q)** — `push_subscriptions` table, Web Push API, voice announcements, app badge. Transient (no persistence beyond subscription rows).

**Recipient identity (the harder half).** The current `send-targeted-message` edge function (`supabase/functions/send-targeted-message/index.ts:69`) resolves class recipients exclusively via `entries → dogs → people.auth_user_id`. Passcode-only exhibitors have no `auth_user_id` and would silently never receive push under this query. The unification's headline persona is the passcode exhibitor, so the fanout must be extended to map recipients via:

- `auth_user_id` (account exhibitors — existing path)
- `ringside_sessions` rows with `show_id = $show, role = 'exhibitor', favorited_armbands ∋ $target_armband` joined back to `push_subscriptions` (passcode exhibitors with manual favorites)
- `ringside_sessions` rows with `show_id = $show, role = $role` joined back to `push_subscriptions` (role-broadcast targets: all stewards, all judges, all admins)
- Checked-in entry list for "everyone checked in"

The existing `push_subscriptions` table provides device-level subscription rows indexed on `user_id` and `license_key`, but **does not** carry role, per-show favorites, or presence data — those columns do not exist today. The new `ringside_sessions` table introduced by Phase 3b is what makes the passcode-recipient join possible; without it, the second arm of the fanout has nothing to query.

**Presence storage (new — replaces client-only `isInRing`).** Phase 3b creates `ringside_sessions(subscription_id, show_id, role, favorited_armbands, last_seen_at, last_seen_route)`:
- `subscription_id uuid` FK to `push_subscriptions(id)` ON DELETE CASCADE
- `show_id uuid` FK to `shows(id)`
- `role text` — `'exhibitor' | 'steward' | 'judge' | 'admin'`
- `favorited_armbands text[]` — exhibitor's manually favorited armbands for this show
- `last_seen_at timestamptz`
- `last_seen_route text` — e.g., `/at-show`, `/at-show/ring/N`
- Primary key on `(subscription_id, show_id)`
- Indexes on `(show_id, role)` for role broadcasts and `(show_id, last_seen_at)` for suppression queries

A client heartbeat (every ~30s while the tab is foregrounded and the user is in `/at-show*`) calls `upsert_ringside_session(...)` to write the row. The RPC is the trust boundary for both account and passcode identities — clients never INSERT/UPDATE `ringside_sessions` directly. Edge function joins through it to resolve passcode recipients AND to suppress push when the user is actively in the destination route.

This is the schema change that the original plan denied; Locked Decision 10 reflects the correction. The separation from `push_subscriptions` matters because push subscriptions are per-device (durable across shows), while ringside sessions are per-(device, show) and prunable after a show ends.

**Unified flow:**

1. Secretary composes in the existing `SecretaryMessagesPage` — no new UI needed.
2. Message persists to `show_messages` (existing flow).
3. The `send-targeted-message` edge function is extended to **also fire push** via `push_subscriptions` to each recipient (account- and passcode-keyed).
4. Push payload includes only `message_id`; receiving client resolves the thread via RLS-protected query. No thread contents in the payload. Tapping a push that the user no longer has access to lands on the inbox with a "this message is no longer available" toast.
5. **Smart suppression:** push is skipped if `last_seen_at` is within the last 60s AND `last_seen_route` starts with `/at-show`. Inbox + realtime still fire.
6. **Failure handling:** each push send is independent. A 404/410 marks the subscription stale; the edge function deletes the row in-transaction. Inbox write is never reverted by push failure. Function returns `{ sent, suppressed, failed, dead_subs_cleaned }`.
7. **Concurrency:** compose sends include a UUID idempotency key; duplicate inserts are deduped at the `show_messages` level. A second concurrent call with the same key short-circuits before fan-out.
8. **Batching:** recipient lists >50 are processed in chunks of 25 with `Promise.allSettled` per chunk.
9. **Kill-switch:** an env-level `PUSH_FANOUT_ENABLED` flag on the edge function — if false, function still persists `show_messages` and emits realtime but skips push entirely.
10. Two-way replies work as today (inbox is thread-based; participants reply). Replies notify the secretary via the same pipeline.

**Targeting (all four supported):**
- Per-exhibitor (existing 1:1 thread)
- Per-class (existing `sendTargetedMessage`, extended to include passcode-keyed recipients)
- Per-checked-in (new — needs UI + recipient resolver via checked-in entry list)
- All-show broadcast (existing `group_label` infrastructure; UI is the small gap to close)

## Branding

- Inside myk9show.com: zero "Q" references. The ringside experience is called "Ringside" or "At the show". Smart input copy is "Use the passcode your secretary gave you".
- Onboarding/install copy mentions Q lineage once: *"the ringside experience you may know as myK9Q, now built right in."*
- Legacy `myk9q.com` retains the Q identity externally (it's the Access-integrated production app, untouched).
- **Secretary handoff:** the `MyK9QAccessCard` component (used by secretaries to print/share access codes for stewards, judges, and exhibitors) currently advertises `myk9q.com` and the "myK9Q Access Codes" header. This contradicts the "type this on myk9show.com" smart-input handoff and is updated in Phase 1, not Phase 5.

## PWA Install

- **One PWA per device.** myk9show.com installs as "myK9Show" — single icon, single install prompt, single notification stream.
- Install prompt fires on the myK9Show homepage (not deferred), so account holders and passcode users both get prompted the same way.

**Migrating existing myK9Q PWA installs:**
- Push subscriptions are origin-bound (`myk9-platform-myk9q.vercel.app`). They cannot be transferred to `myk9show.com`. Existing users must re-install/re-subscribe under the new origin.
- The Phase 4 redirect page includes a one-time "Re-install the ringside experience on myk9show.com to keep getting notifications" prompt with iOS + Android install instructions.
- LocalStorage/IndexedDB on the old origin (favorites, last-seen show, voice settings) is not migrated. Document in release notes.

## Observability

- Edge function logs include: targets count, suppressed count, failures count, dead-sub-cleanup count, elapsed ms.
- Dashboard (Supabase logs or Grafana board) tracks daily push attempt vs. delivery rate.
- Suppression-hit rate logged per session.
- Alert: push failure rate >5% over a 1-hour window pages on-call.

## Feature Flag

- `shows.unified_ringside_enabled` (boolean column, default false) — per-show enablement so pilot clubs opt in independently. Note: this is on the existing `shows` table.
- A new `feature_flag_overrides(person_id uuid, flag_name text, enabled boolean, set_at timestamptz)` table — user-level override keyed by `people.id` (the canonical person table; there is no `profiles` table in this schema). PK on `(person_id, flag_name)`. Lets staff/testers preview before a show flips, and is reusable for future flags without another migration.
- Homepage banner and `/at-show` route check both: the per-show flag AND the per-person override (override wins if present). When false, account holders see the legacy `ShowDayPage` until Phase 4 deletes it.

**RLS on `feature_flag_overrides`:**
- SELECT: a user reads only their own row, scoped by `person_id IN (SELECT id FROM people WHERE auth_user_id = auth.uid())`. Admins (per existing `is_site_admin()` predicate) read all rows.
- INSERT / UPDATE / DELETE: admins only. Users do not self-grant previews — this is a staff-only tool.
- Anonymous (passcode-only) users cannot read or write — they have no `people` row tied to `auth.uid()` and the flag is irrelevant to their UI path.

## Critical Files & Locations

**myK9Show (existing, to be modified):**
- `apps/myk9show/src/routes/publicRoutes.tsx` — add `/at-show` route (lazy-loaded), retire `ShowDayPage` / `ClassCheckInPage` routes
- `apps/myk9show/src/pages/ShowDayPage.tsx`, `apps/myk9show/src/pages/ClassCheckInPage.tsx` — delete after `/at-show` is live
- `apps/myk9show/src/pages/MyEntriesPage.tsx` — **keep** (belongs in account home)
- `apps/myk9show/src/utils/passcodes.ts` — widen to accept both legacy + UUID license-key formats (Phase 0 prerequisite)
- `apps/myk9show/src/features/messages/pages/SecretaryMessagesPage.tsx` — extend with "everyone checked in" + "everyone in show" targets
- `apps/myk9show/src/features/messages/.../MyK9QAccessCard.tsx` — rebrand to "Show Access Codes" + `myk9show.com` URL (Phase 1, not Phase 5)
- `apps/myk9show/src/store/messageStore.ts` — wire to shared notification package
- `apps/myk9show/src/hooks/useShowDayAlerts.ts`, `useNotificationStore.ts` — delete after shared module is in place

**myK9Q (existing, to be extracted):**
- `apps/myk9q/src/contexts/AuthContext.tsx`, `apps/myk9q/src/utils/auth.ts` — passcode + role-prefix logic → extract to shared package (note: existing parser at `auth.ts:45` already supports `a/j/s/e`; preserve)
- `apps/myk9q/src/pages/Login/Login.tsx`, `apps/myk9q/src/pages/Home/Home.tsx` — UI → consumed via shared package
- myK9Q notification service (push subscription mgmt, voice announcements) → extract to shared package

**Supabase:**
- `show_messages`, `show_message_threads` — reuse as-is
- `push_subscriptions` — **unchanged schema**; reuse the existing per-device subscription rows
- **New table `ringside_sessions(subscription_id, show_id, role, favorited_armbands, last_seen_at, last_seen_route)`** — per-(device, show) state for ringside (Phase 3b migration). Direct client writes denied; mutations go through the RPC below.
- **New table `feature_flag_overrides(person_id, flag_name, enabled, set_at)`** — per-person flag overrides (Phase 1 migration, shipped with the feature flag itself)
- `send-targeted-message` edge function — extend to (a) fan out push, (b) resolve passcode-only recipients via `ringside_sessions`, (c) consult `ringside_sessions.last_seen_at` / `last_seen_route` for suppression
- New RPC: `get_account_today_entries()` (no parameters; derives `person_id` from `auth.uid()`) for the auto-favorite predicate (Phase 0)
- **New RPC: `upsert_ringside_session(passcode, subscription_endpoint, show_id, favorited_armbands, route)`** — `SECURITY DEFINER` write path for `ringside_sessions`; validates passcode against `mobile_app_lic_key` OR `auth.uid()` ownership of the subscription, then upserts (Phase 3b)
- **New scheduled function: `prune_stale_ringside_sessions()`** — runs daily, deletes rows for shows that ended >7 days ago AND rows with `last_seen_at` older than 24h regardless of show (Phase 3b)

**Tooling:**
- `scripts/bootstrap-worktree.sh` — verify after `apps/myk9q` removal in Phase 6
- `pnpm-workspace.yaml`, root `package.json` scripts — remove `dev:q`, `test:q`, etc. in Phase 6

## Implementation Phases

### Phase 0 — Extract & share (foundation)

**Prerequisite (blocking):** resolve legacy passcode format per the "Passcode format (canonical)" section above. Audit `mobile_app_lic_key` rows AND check whether any passcodes derived from legacy-format keys are already in circulation (printed access cards, secretary email handoffs, exhibitor wallets). **Default to option A (accept both formats) unless the audit proves zero codes are distributed.** Option B (migration + re-derivation) invalidates any in-circulation codes and requires a 60-day parallel-acceptance window plus secretary re-issue if attempted. Document the audit results and the chosen path in the Phase 0 PR description. The smart-input regex, parser, and generator must all agree on the canonical shape before Phase 1.

1. Create `packages/ringside` containing extracted myK9Q UI, auth/passcode logic, and the shared notification module.
2. Port the `isInRing` suppression idea from myK9Show's `useNotificationStore` into the shared notification module (still client-only at this phase; durable presence comes in Phase 3).
3. Have the existing `apps/myk9q` app consume the new package — verify it still builds and behaves identically.
4. **Authorization:** implement Supabase RPC `get_account_today_entries()` (no parameters) returning entry IDs the signed-in account may favorite. The function derives `person_id` from `auth.uid()` internally by joining through `people.auth_user_id`; if unauthenticated, returns an empty result rather than erroring. Predicate per Locked Decision 7 (`handler_id = $person_id OR owner_id = $person_id OR co_owner_id = $person_id`, scoped to today's shows). RLS enforced on `entries` as a defense-in-depth layer beneath the RPC.
5. **Tests:** unit tests for passcode role parsing (including both legacy + UUID derivation per Phase 0 prerequisite), push suppression logic, owner-or-handler-or-coowner favorite resolver (owner-only, handler-only, co-owner-only, all-three, none). Integration tests: (a) tampered client cannot favorite entries that aren't theirs (the RPC takes no parameters, so this is enforced by `auth.uid()` derivation); (b) calling the RPC while unauthenticated returns an empty result rather than erroring or leaking rows. Must be green before Phase 1.

### Phase 1 — Smart-input landing + `/at-show` route

1. Add `/at-show` route to `apps/myk9show/src/routes/publicRoutes.tsx`, lazy-loaded via `React.lazy`, rendering the shared ringside package inside myK9Show's app shell. Add a bundle-size budget assertion to CI.
2. Add homepage smart-input landing per the "Smart-Input UX" section: single field with live disambiguation, discoverability copy, `/help/credentials` link, autocomplete attributes, focus management, aria-live regions, submit gating, server-side rate limiting + enumeration-resistant errors.
3. Add the post-credential routing table targets, including the **admin (`a****`) route** to the existing admin/show-management UI.
4. Wire the passcode flow into myK9Show's auth context so it coexists with the account session per Locked Decision 8 (signed-in user typing a passcode sees the confirmation step before role attaches).
5. Create `/help/credentials` docs page. Broken link = ship blocker.
6. **Rebrand `MyK9QAccessCard`:** rename to "Show Access Codes" (or similar), replace `myk9q.com` URLs with `myk9show.com`, update header copy. Cross-check secretary print previews.
7. **Tests:** Playwright spec exercising the four passcode shapes (`s****`, `e****`, `j****`, `a****`), account sign-in, signed-in-user-types-passcode confirmation, and the unrecognized-input error path. Unit tests for shape detection (email vs passcode vs invalid, with case/whitespace/zero-width normalization). Manual verification of password-manager autofill on iOS Safari and Chrome desktop.

### Phase 2 — Account-holder show-day auto-routing

1. Implement "Show today" banner on myK9Show homepage. Single CTA when one show today; stacked list ordered by earliest class time when multiple; hidden when zero.
2. Implement auto-favorite logic: on banner-tap or `/at-show` mount, call `get_account_today_entries()` (no parameters — RPC derives identity from session) and pre-favorite the returned IDs. Client never receives or trusts unrelated entry IDs.
3. **Tests:** unit tests covering owner-only, handler-only, co-owner-only, owner+handler, owner+co-owner, handler+co-owner, all-three, and zero-entry cases. Playwright spec covering banner appearance (single, multi, zero) + auto-favorite assertion. Authorization Playwright: account A attempts to favorite an entry owned by account B → RLS denial.

### Phase 3a — Recipient identity (extend fanout to reach passcode users)

This phase has no push delivery — it only fixes who the fanout *would* target. Push delivery is Phase 3b.

**Note:** Phase 3a depends on the `ringside_sessions` table that Phase 3b creates. Land 3b's migration first (table only, no client heartbeat yet), then Phase 3a's recipient resolution, then Phase 3b's remaining steps (heartbeat + push + suppression). The phase numbers reflect logical separation, not migration order.

1. Migration: create `ringside_sessions(subscription_id, show_id, role, favorited_armbands, last_seen_at, last_seen_route)` as defined in Messaging Architecture. (Phase 3b will populate it; Phase 3a only needs the schema to exist for the query to compile.)
2. Extend `send-targeted-message` recipient resolution to query both:
   - Account-keyed: existing `entries → dogs → people.auth_user_id` arm
   - Passcode-keyed: `ringside_sessions` joined to `push_subscriptions` filtered by `show_id`, `role`, and `favorited_armbands ∋ target_armband` for per-armband targets; `(show_id, role)` for role broadcasts
3. Add "Everyone checked in" recipient resolver (via checked-in entry list) and "Everyone in show" target (via `group_label`) to the existing edge function.
4. Add "Everyone checked in" and "Everyone in show" target options to `SecretaryMessagesPage`'s `ComposeTargetedModal`.
5. **Tests:** edge function unit tests confirming each target shape returns the correct recipient set including passcode users. Specific regression test: a passcode-only exhibitor with a `ringside_sessions` row favoriting an armband receives a per-class message.

### Phase 3b — Push delivery + presence-aware suppression

1. **Schema:** the `ringside_sessions` table is created in Phase 3a step 1 (so its presence unblocks the fanout query). Phase 3b's schema work is the RLS policies and the write-path RPC. Direct INSERT/UPDATE/DELETE on `ringside_sessions` is **denied for all client roles** — including authenticated users. SELECT is allowed only for the service role (edge function context) and site admins. All client writes go through the `upsert_ringside_session(...)` `SECURITY DEFINER` RPC, which validates the credential (passcode against `mobile_app_lic_key` for anonymous callers, OR `auth.uid()` against the subscription's `user_id` for signed-in callers) before performing the upsert. This is the resolution for the cross-identity write path: passcode users have no `auth.uid()`, so account-based RLS would lock them out; routing all writes through the RPC unifies the path.
2. **Client heartbeat:** in the shared ringside module, while the tab is foregrounded and the user is in `/at-show*`, call `upsert_ringside_session(...)` every ~30s passing the current `last_seen_route`, `role`, and `favorited_armbands`. The RPC sets `last_seen_at = now()` server-side (clients do not control timestamps). On unmount/blur, call `clear_ringside_session_presence(subscription_endpoint, show_id)` — a sibling RPC that sets `last_seen_at` to NULL without removing favorites.
3. **Cleanup:** create scheduled function `prune_stale_ringside_sessions()` running via pg_cron daily at low-traffic hours:
   - Delete rows where `show_id` references a show whose last trial ended >7 days ago (these shows are concluded; the data has no further use).
   - Delete rows where `last_seen_at IS NULL OR last_seen_at < now() - interval '24 hours'` AND the show is concluded (handles abandoned passcode sessions and crashed tabs).
   - Log row counts removed.
4. Extend `send-targeted-message` to fan out push notifications via `push_subscriptions` after writing to `show_messages`, using the resolved recipient set from Phase 3a.
5. Apply suppression: skip push if the recipient has a `ringside_sessions` row for this show with `last_seen_at` within the last 60s AND `last_seen_route` starting with `/at-show`.
6. Push payload includes only `message_id`; client resolves the thread via RLS.
7. **Error handling:** 404/410 from push service → delete subscription row in-transaction. Other 5xx → log + retry once with exponential backoff.
8. **Concurrency:** idempotency key on send; dedupe at `show_messages`.
9. **Batching:** recipient lists >50 chunked at 25 with `Promise.allSettled`.
10. **Kill-switch:** `PUSH_FANOUT_ENABLED` env var on the edge function. Ship with `false`; flip to `true` for the pilot show.
11. **Tests:**
    - Edge function unit tests (per-exhibitor, per-class, per-checked-in, all-show targets each fan out correctly including passcode recipients).
    - Suppression tests using heartbeat fixtures.
    - Stale-subscription cleanup test (seed a 404 endpoint, assert deletion).
    - **RPC authorization tests:** anonymous caller with valid passcode → upsert succeeds with correct `license_key`/`role`; anonymous caller with invalid passcode → rejected; authenticated caller upserting for a subscription they don't own → rejected; cross-identity attack (passcode argument provided AND `auth.uid()` present, with mismatched `user_id` on the subscription) → rejected.
    - **Cleanup function tests:** seed a concluded show with `ringside_sessions` rows older than 7 days → `prune_stale_ringside_sessions()` removes them; rows on an active show or recent rows are untouched.
    - E2E: secretary composes → exhibitor receives push → tapping push opens correct inbox thread.

### Phase 4 — Retire duplicated surfaces

1. Delete `ShowDayPage`, `ClassCheckInPage`, `useShowDayAlerts`, `useNotificationStore` and their route entries.
2. Keep `MyEntriesPage`.
3. Sunset the standalone myK9Q vercel deployment. Add a redirect on `myk9-platform-myk9q.vercel.app` pointing to myk9show.com.
4. The redirect page includes a one-time "Re-install on myk9show.com to keep getting notifications" prompt with iOS + Android install instructions.
5. Update PWA manifest in myK9Show to single "myK9Show" identity.
6. Document in release notes that favorites/voice settings on the old origin will not transfer.
7. **Tests:** confirm no orphaned imports, no broken routes; CI typecheck + lint pass clean.

### Phase 5 — Branding & onboarding copy

1. Add homepage copy hinting at Q lineage: *"the ringside experience you may know as myK9Q, now built right in"*.
2. Audit and remove all "myK9Q" string references inside the unified app surface (search for "myK9Q", "myk9q", "MyK9Q"). The `MyK9QAccessCard` rebrand was already done in Phase 1; this is a sweep of remaining references.
3. Update install prompt copy for the at-show audience.
4. **Accessibility pass on the smart-input landing:** verify focus order, label clarity, 44pt tap targets, and contrast on the older-user device set used for UAT.
5. **Tests:** snapshot test of homepage copy; grep test in CI to prevent regression of removed strings.

### Phase 6 — Delete `apps/myk9q`

Waits at least 30 days after Phase 4 redirect is live so stale PWA installs have a chance to land on the redirect and be migrated.

1. Confirm `packages/ringside` is consumed only by `apps/myk9show` (no remaining `apps/myk9q` imports of anything outside the package).
2. Delete `apps/myk9q/` directory.
3. Remove `apps/myk9q` from `pnpm-workspace.yaml`, root `package.json` scripts (`dev:q`, `test:q`, etc.), turbo pipeline configs, and any CI workflow references.
4. Delete the `myk9-platform-myk9q.vercel.app` Vercel project.
5. Update `CLAUDE.md` to remove `apps/myk9q` references.
6. Update `scripts/bootstrap-worktree.sh` and any docs that reference `pnpm dev:q` or `apps/myk9q`.
7. **Tests:** full monorepo `pnpm build`, `pnpm typecheck`, `pnpm lint`, and `pnpm test` pass cleanly. No dangling references via `grep -r "apps/myk9q"`.

### Out of scope for this plan

- Touching legacy `myk9q.com` (separate repo, Access-integrated, untouched).
- Schema changes to `show_messages` or `push_subscriptions` (both reused as-is; all new schema goes into the new `ringside_sessions` and `feature_flag_overrides` tables).
- Replacing the existing exhibitor inbox UI design.
- Magic-link or SSO sign-in (could layer onto the email branch later).
- Biometric / WebAuthn (different conversation).
- Localization of disambiguation copy.

## Verification

**End-to-end walks (Playwright, one spec per persona):**
1. **Account exhibitor entered today:** sign in → see "Show today" banner → tap → `/at-show` loads with dogs auto-favorited → secretary sends class message → push fires → tapping opens inbox thread.
2. **Account exhibitor not entered:** sign in → no banner → on the smart input on a separate device, type `e****` → manual favoriting.
3. **Volunteer steward:** anonymous → type `s****` in smart input → land on steward UI.
4. **Judge:** anonymous → type `j****` in smart input → land on judge UI.
5. **Admin:** anonymous → type `a****` in smart input → land on admin UI.
6. **Secretary:** sign in → workbench → compose message → pick "Everyone checked in" → verify recipients include both account and passcode exhibitors → push fanout fires.
7. **Multi-show-today:** seed an account with entries in two same-day shows → assert banner is a list with both rows, ordered by earliest class.
8. **Signed-in passcode-attach:** sign in as an account → type a passcode in the smart input → confirmation appears → confirm → passcode role attached to existing session.

**Suppression check:** open `/at-show` in browser → heartbeat fires → secretary sends targeted message → assert inbox updates but no push fires for that session. Close tab → wait 70s → send again → push fires.

**Push failure walk:** seed a stale push subscription (404 endpoint) → send targeted message → assert inbox is delivered, dead sub is cleaned, edge function returns `failed: 1, dead_subs_cleaned: 1`.

**Authorization walk:** signed-in account A calls `get_account_today_entries()` → receives only A's entries (the RPC has no parameter to tamper with). Anonymous client calls the RPC → empty result, no error. Account A attempts to insert a `ringside_sessions` row for a `subscription_id` owned by account B → expect RLS denial.

**Bundle budget:** CI asserts homepage entry chunk size has not regressed beyond the budget set in Phase 1 step 1.

**Smart-input shape coverage:** unit + Playwright covering all five passcode prefixes (`a/j/s/e` + the case-insensitive normalization), email, and invalid inputs (empty, mixed, whitespace-only, zero-width chars, internal newline).

**Regression:** smoke-test legacy `myk9q.com` is unaffected (DNS check; not in this repo).

**Manual UAT:** older user representative walks the account-holder flow and the passcode flow end-to-end on a phone; confirms no "where do I go?" moments.

## Rollout

- Phase 0 prerequisite (legacy passcode resolution) blocks all subsequent phases.
- Phases 0–2 ship behind `shows.unified_ringside_enabled` per show. Pilot with one club's show before global enable.
- Phase 3a (recipient identity) ships dark — no behavior change for users, only the resolver expands.
- Phase 3b ships with `PUSH_FANOUT_ENABLED=false` initially. Flip to true for the pilot show only. Once stable for two clean shows, flip globally.
- Phase 4 sunset happens after the pilot show plus one more clean show.
- Phase 5 copy/branding ships independently and is safe to revert.
- Phase 6 deletion waits at least 30 days after the Phase 4 redirect is live.

## Change log

- **2026-05-17** — Initial plan.
- **2026-05-25** — Smart-input addendum merged in. Locked Decision 2 replaced; Locked Decisions 8–10 added. Phase 3 split into 3a (recipient identity) + 3b (push delivery). Admin (`a****`) routing added. Legacy passcode format made a Phase 0 prerequisite. Auto-favorite resolver predicate spelled out with `co_owner_id`. `MyK9QAccessCard` rebrand moved from Phase 5 to Phase 1. Presence storage columns added to `push_subscriptions` (corrects original "no schema changes" assumption).
- **2026-05-25 (revision 2)** — Second review applied. Presence + role + per-show favorites moved off `push_subscriptions` into a new `ringside_sessions(subscription_id, show_id, role, favorited_armbands, last_seen_at, last_seen_route)` table (separates per-device push state from per-(device, show) ringside state). Replaced fictional `profiles.unified_ringside_preview` with a real `feature_flag_overrides` table keyed on `people.id`. Tightened RPC signature to `get_account_today_entries()` with no parameters (derives identity from `auth.uid()` to remove IDOR surface). Fixed misleading citation about `push_subscriptions` join surface — the *indexes* on `user_id`/`license_key` exist, but the *columns* for role/favorites do not; they live on the new table.
- **2026-05-25 (revision 3)** — Third review applied. Added explicit Risk/Validation profile to the document header (High risk, Full validation). Default for the legacy-passcode Phase 0 prerequisite flipped from "decide A or B based on size" to "default to A unless the audit proves zero codes are distributed"; option B now requires a 60-day parallel-acceptance window plus secretary re-issue when chosen. Note: the third reviewer's findings #1, #2, #3 (schema, RPC parameter, profiles table) were already addressed in revision 2; the reviewer was looking at the consolidation commit before revision 2 had landed locally for them.
- **2026-05-25 (revision 4)** — Fourth review applied. **Critical architectural fix:** added Locked Decision 11 establishing a `SECURITY DEFINER` RPC (`upsert_ringside_session`) as the unified write path for `ringside_sessions`. Anonymous passcode users have no `auth.uid()`, so the prior account-based RLS would have silently locked them out of writing — making the unification's headline persona invisible to the push fanout. The RPC validates a passcode argument OR `auth.uid()` ownership before upserting; direct table writes are denied. Also added: explicit RLS rules for `feature_flag_overrides` (users read own, admins read/write all), a scheduled cleanup function `prune_stale_ringside_sessions()` for ended-show and abandoned-session rows, and corresponding RPC-authorization + cleanup tests. Fixed stale out-of-scope bullet that claimed `push_subscriptions` was the touched schema.
