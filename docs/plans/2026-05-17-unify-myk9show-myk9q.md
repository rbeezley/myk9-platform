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

8. **Session precedence:** when a signed-in account enters a passcode in the smart input, the passcode role is granted _in addition to_ the account session, scoped to that single show. The passcode does not impersonate the account; it temporarily expands role. Account session remains the source of truth for identity, audit trails, and push subscription ownership. UI confirms before attaching: _"You're signed in as [name]. Use this passcode to join [show] as a [role]?"_

9. **Multi-show-today banner:** if the account has entries in >1 show today, the banner becomes a stacked list (one row per show) ordered by earliest class time. Single show → single CTA. Zero shows → no banner.

10. **Schema changes are required.** The original "no schema changes for phases 0–4" assumption is dropped. The plan adds three new tables: `show_passcodes` (Phase 0 — replaces the old license-key derivation model with per-(show, role) hashed random codes), `ringside_sessions` (Phase 3a — per-(device, show) presence + favorites + role), and `feature_flag_overrides` (Phase 1 — per-person flag overrides). The existing `push_subscriptions` table is unchanged; the `license_key` column on it becomes vestigial for new sessions (left in place for now, removed in a follow-up cleanup migration after Phase 6).

11. **Write path for `ringside_sessions` is via a `SECURITY DEFINER` RPC, not direct table writes.** Anonymous passcode users have no `auth.uid()`, so account-based RLS would lock them out of writing — and they are the headline persona. The RPC `upsert_ringside_session(passcode_or_null, subscription_endpoint, favorited_armbands, route)` runs with elevated privileges. It validates the credential by hashing the passcode (if provided) and looking up the matching row in `show_passcodes` — that row yields `show_id` and `role`, which the client never controls. For authenticated callers passing `auth.uid()` instead of a passcode, the function verifies the subscription's `user_id` matches and uses a derived `show_id` from the caller's account context (the auto-favorite flow already computed it). Direct INSERT/UPDATE on `ringside_sessions` is denied to all client roles; only this RPC and the service-role edge function can write. This unifies the write path for both account and passcode identities behind a single validated entry point, and removes any way for a tampered client to spoof `show_id` or `role`.

## Passcode format (canonical)

**The new platform abandons the myK9Q license-key derivation model entirely.** Passcodes are no longer derived from a `mobile_app_lic_key` (which exposed a cryptographic link between the 4 codes — knowing the license key let anyone re-derive all 4 codes, including admin). Instead, each show gets **4 independently random codes**, one per role, generated once at show creation and fixed for the life of the show.

**Code shape:** 5 characters. First char is the role letter (`a` admin / `j` judge / `s` steward / `e` exhibitor); remaining four chars are random lowercase alphanumeric (`[a-z0-9]`). Examples: `aq8m2`, `j7xk0`, `s4nf3`, `eh2p9`. Case-insensitive on input (normalized to lowercase before validation).

**Storage:** new table `show_passcodes(id uuid PK, show_id uuid FK shows ON DELETE CASCADE, role text, passcode_hash text NOT NULL, created_at timestamptz, UNIQUE(show_id, role))`. Codes are hashed at rest using **HMAC-SHA256 with a server-side pepper held in Supabase Vault** (secret name: `passcode_pepper`). HMAC was chosen over bcrypt/argon2id because the canonical `validate_passcode` path needs an indexed equality lookup — bcrypt/argon2id use per-row random salts, so two hashes of the same input never match by equality and validation degenerates to a full table scan (~1ms × N rows of bcrypt). HMAC gives O(log N) lookup via a btree index on `passcode_hash`, and the pepper held outside the DB provides the "DB compromise doesn't leak codes" property without requiring a slow hash: an attacker with only the database has neither the pepper nor a reversible mapping. The 5-char namespace is small (~6.7M) so rainbow-table-style precomputation is cheap if the pepper leaks; rotating the pepper requires re-hashing all live codes (a documented Phase-0 operational note, not a runtime concern). Plaintext is shown to the secretary exactly once at generation time, then never re-displayed (they print/distribute it from the access-card UI). If a code is lost, the secretary regenerates (replaces the row) — this is the rare path; default is "generate at show creation, leave alone."

**Generation:** when a show row is inserted, a trigger or application code inserts 4 `show_passcodes` rows. The plaintext codes are returned to the show-creation flow once for display on the secretary's access card; thereafter, only hashes exist server-side. The legacy `mobile_app_lic_key` column on `shows` is no longer populated for new shows (it stays on the schema as nullable until Phase 6 cleanup; not removed in this plan).

**Validation flow:**

1. User types a 5-char passcode in the smart input.
2. Client sends the lowercased code to the `validate_passcode(code text)` `SECURITY DEFINER` RPC.
3. RPC computes `encode(hmac(lower(input), pepper, 'sha256'), 'hex')` (pepper read from Vault inside the SECURITY DEFINER function) and selects from `show_passcodes` where `passcode_hash = $hmac`. If exactly one row matches → return `{show_id, role}`. If no row matches → return null (the smart input shows the generic enumeration-resistant error). The HMAC is deterministic so the lookup is a single indexed equality probe; constant-time response padding to the 250ms floor still applies for timing-attack resistance.
4. The same `show_id` + `role` is then used by `upsert_ringside_session(...)` to attach the device to the show.

Because every code is now independently random, an attacker who learns an exhibitor code gains no information about the judge or admin code for the same show — a real security improvement over the derivation model.

## Routing & Roles Summary

| Person                            | URL          | Credential                            | Lands on                                                          | Notification routing                                                                            |
| --------------------------------- | ------------ | ------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Account exhibitor (entered today) | myk9show.com | Email → password                      | Banner → `/at-show` w/ dogs auto-favorited                        | Account-bound; targetable by armband or account                                                 |
| Account exhibitor (not entered)   | myk9show.com | Email → password, then types passcode | Manual favoriting                                                 | Per-favorite                                                                                    |
| Non-account exhibitor             | myk9show.com | Passcode `e****`                      | Ringside, manual favoriting                                       | Per-favorite (mapped via the `ringside_sessions` row's `show_passcode_id` + favorited_armbands) |
| Steward (volunteer)               | myk9show.com | Passcode `s****`                      | Steward timer/check-in UI                                         | Steward-specific alerts only                                                                    |
| Judge                             | myk9show.com | Passcode `j****`                      | Judge scoring UI                                                  | Judge-specific alerts only                                                                      |
| **Admin**                         | myk9show.com | Passcode `a****`                      | Admin/show-management UI (existing myK9Q admin surface, retained) | Admin-broadcast alerts                                                                          |
| Secretary                         | myk9show.com | Email → password                      | Workbench                                                         | Sender, not receiver, for show-day notifications                                                |

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

The existing `push_subscriptions` table provides device-level subscription rows, but **does not** carry role, per-show favorites, or presence data — those columns do not exist there. The new `ringside_sessions` table introduced by Phase 3a is what makes the passcode-recipient join possible. It links to `show_passcodes` via `show_passcode_id` (the column that identifies which (show, role) the session is for), and to `push_subscriptions` via `subscription_id` (the device). Together they form the join surface for the second arm of the fanout.

**Presence storage (new — replaces client-only `isInRing`).** Phase 3a creates `ringside_sessions`:

- `subscription_id uuid` FK to `push_subscriptions(id)` ON DELETE CASCADE
- `show_id uuid` FK to `shows(id)` ON DELETE CASCADE
- `show_passcode_id uuid NULL` FK to `show_passcodes(id)` — set for passcode-keyed sessions; NULL for account-keyed sessions (account users have an implicit `'exhibitor'` role on `/at-show`)
- `role text` — `'exhibitor' | 'steward' | 'judge' | 'admin'`. Denormalized from `show_passcodes.role` when `show_passcode_id` is non-null, hard-coded to `'exhibitor'` when null
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
- Onboarding/install copy mentions Q lineage once: _"the ringside experience you may know as myK9Q, now built right in."_
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
- `apps/myk9show/src/utils/passcodes.ts` — rewrite: remove all derivation logic; replace with the random generator that produces `[role-letter][4 random a-z0-9]` and inserts hashed codes into `show_passcodes` on show creation
- `apps/myk9show/src/features/messages/pages/SecretaryMessagesPage.tsx` — extend with "everyone checked in" + "everyone in show" targets
- `apps/myk9show/src/features/messages/.../MyK9QAccessCard.tsx` — rebrand to "Show Access Codes" + `myk9show.com` URL (Phase 1, not Phase 5)
- `apps/myk9show/src/store/messageStore.ts` — wire to shared notification package
- `apps/myk9show/src/hooks/useShowDayAlerts.ts`, `useNotificationStore.ts` — delete after shared module is in place

**myK9Q (existing, to be extracted):**

- `apps/myk9q/src/contexts/AuthContext.tsx`, `apps/myk9q/src/utils/auth.ts` — passcode + role-prefix logic → extract to shared package. **Drop the `generatePasscodesFromLicenseKey` / `myK9Q1-...` derivation entirely**; the shared package's auth flow calls `validate_passcode(code)` against `show_passcodes` instead. The role-letter parser at `auth.ts:45` still applies (the input shape is unchanged) but it's used only as a fast client-side shape check before the server lookup, not as a security boundary.
- `apps/myk9q/src/pages/Login/Login.tsx`, `apps/myk9q/src/pages/Home/Home.tsx` — UI → consumed via shared package
- myK9Q notification service (push subscription mgmt, voice announcements) → extract to shared package

**Supabase:**

- `show_messages`, `show_message_threads` — reuse as-is
- `push_subscriptions` — **unchanged schema**; reuse the existing per-device subscription rows. The `license_key` column on this table becomes vestigial for new sessions (left in place; not removed in this plan).
- **New table `show_passcodes(id, show_id, role, passcode_hash, created_at, UNIQUE(show_id, role))`** — 4 hashed random codes per show, generated at show creation (Phase 0 migration). Replaces the old `mobile_app_lic_key` derivation model.
- **New table `ringside_sessions(subscription_id, show_id, show_passcode_id NULL, role, favorited_armbands, last_seen_at, last_seen_route)`** — per-(device, show) state for ringside (Phase 3a migration). Direct client writes denied; mutations go through the RPC below.
- **New table `feature_flag_overrides(person_id, flag_name, enabled, set_at)`** — per-person flag overrides (Phase 1 migration, shipped with the feature flag itself)
- `send-targeted-message` edge function — extend to (a) fan out push, (b) resolve passcode-only recipients by joining `ringside_sessions` (via `show_passcode_id` and `role`) to `push_subscriptions`, (c) consult `ringside_sessions.last_seen_at` / `last_seen_route` for suppression
- New RPC: `get_account_today_entries()` (no parameters; derives `person_id` from `auth.uid()`) for the auto-favorite predicate (Phase 0)
- **New RPC: `validate_passcode(code text)`** — `SECURITY DEFINER`; hashes the input and matches against `show_passcodes`; returns `{show_id, role}` or null. Used by the smart input and as the first step of `upsert_ringside_session` (Phase 0)
- **New RPC: `upsert_ringside_session(passcode_or_null, subscription_endpoint, favorited_armbands, route)`** — `SECURITY DEFINER` write path for `ringside_sessions`; calls `validate_passcode` for anonymous callers OR derives identity from `auth.uid()` for signed-in callers, then upserts. Show_id and role are derived server-side, never trusted from client (Phase 3b)
- **New RPC: `clear_ringside_session_presence(subscription_endpoint, show_id)`** — sets `last_seen_at = NULL` on unmount/blur without removing favorites (Phase 3b)
- **New scheduled function: `prune_stale_ringside_sessions()`** — runs daily, deletes rows for shows that ended >7 days ago AND rows with `last_seen_at` older than 24h regardless of show (Phase 3b)

**Tooling:**

- `scripts/bootstrap-worktree.sh` — verify after `apps/myk9q` removal in Phase 6
- `pnpm-workspace.yaml`, root `package.json` scripts — remove `dev:q`, `test:q`, etc. in Phase 6

## Implementation Phases

### Phase 0 — Extract & share (foundation)

**Note on the passcode model:** the platform is starting fresh with the `show_passcodes` table (no transition from the old `mobile_app_lic_key` derivation). Existing myK9Q derivation code is removed in this phase, not preserved. The `mobile_app_lic_key` column on `shows` is left in place but stops being populated for new shows; a follow-up cleanup migration after Phase 6 can drop it once nothing reads it.

1. **Migration: `show_passcodes` table.** Create `show_passcodes(id uuid PK, show_id uuid FK shows ON DELETE CASCADE, role text CHECK role IN ('admin','judge','steward','exhibitor'), passcode_hash text NOT NULL, created_at timestamptz DEFAULT now(), UNIQUE(show_id, role))`. Index on `passcode_hash` for lookup. RLS: deny all client roles; service role + site admins only. Same migration ensures `extensions.pgcrypto` is installed (needed for `hmac()`) and bootstraps the `passcode_pepper` Vault secret (generated via `gen_random_bytes(32)` if absent so the migration is idempotent and self-contained for fresh environments).
2. **Generation logic.** Add the passcode generator to `@myk9/core`: produces a 5-char code with role-letter prefix and 4 random lowercase alphanumeric chars (uses `crypto.getRandomValues` with rejection sampling to avoid modulo bias, no `Math.random`). The application generates plaintexts client-side and passes them to a `insert_show_passcodes(p_show_id uuid, p_codes jsonb)` SECURITY DEFINER RPC that performs the HMAC and the insert atomically — this keeps the Vault pepper inside the database (clients never see it). Wire into the show-creation flow so 4 rows are inserted into `show_passcodes` whenever a show is created. Plaintext codes are returned to the show-creation response exactly once for the secretary's access card; thereafter, only hashes exist server-side. Apply the same logic to existing shows in a backfill migration; because a SQL-only backfill has no app context to return plaintexts to the secretary, the backfill generates codes server-side via `gen_random_bytes`/`encode` and stores **only hashes** — secretaries of pre-existing shows must explicitly regenerate codes (via a new admin RPC `regenerate_show_passcodes(p_show_id)` that returns fresh plaintexts) before distributing. Backfill is therefore a "deactivate old codes" step rather than a "produce new printable codes" step; the operational implication is documented in the Phase 0 PR description.
3. **`validate_passcode(code text)` RPC.** `SECURITY DEFINER`, returns `{show_id uuid, role text}` or null. Computes `hmac(lower(code), vault.read_secret('passcode_pepper'), 'sha256')` and selects from `show_passcodes` by indexed equality. Application-layer rate limiting per the Security section; the RPC itself does the lookup unconditionally so its timing remains constant.
4. Create `packages/ringside` containing extracted myK9Q UI, auth/passcode logic (now calling `validate_passcode` instead of doing client-side derivation), and the shared notification module.
5. Port the `isInRing` suppression idea from myK9Show's `useNotificationStore` into the shared notification module (still client-only at this phase; durable presence comes in Phase 3).
6. Have the existing `apps/myk9q` app consume the new package — verify it still builds and behaves identically against the new passcode store.
7. **Authorization:** implement Supabase RPC `get_account_today_entries()` (no parameters) returning entry IDs the signed-in account may favorite. The function derives `person_id` from `auth.uid()` internally by joining through `people.auth_user_id`; if unauthenticated, returns an empty result rather than erroring. Predicate per Locked Decision 7 (`handler_id = $person_id OR owner_id = $person_id OR co_owner_id = $person_id`, scoped to today's shows). RLS enforced on `entries` as a defense-in-depth layer beneath the RPC.
8. **Tests:**
   - Passcode generator unit tests: shape is `[a|j|s|e][a-z0-9]{4}`, output uses CSPRNG, 4 codes per show are distinct, distribution across the 36-char alphabet is uniform within statistical tolerance on N=10000 generations.
   - `validate_passcode` tests: matching code returns `{show_id, role}`; non-matching returns null; case-insensitive on input; identical plaintext codes in two different shows both validate (HMAC is deterministic so the UNIQUE constraint on `(show_id, role)` — not on `passcode_hash` — is what prevents collisions within a single show); the pepper is read from Vault inside the function (test by rotating the pepper and asserting old hashes no longer validate).
   - `insert_show_passcodes` tests: hashes are not equal to plaintexts; client passing a `show_id` for a show they don't own is rejected (the RPC validates club_admin/site_admin authorization the same way `create_show_with_children` does).
   - `regenerate_show_passcodes` tests: replaces all 4 rows for a show; returns 4 plaintexts; old plaintexts no longer validate; only club admins or site admins may call it.
   - `get_account_today_entries` tests: owner-only, handler-only, co-owner-only, owner+handler, owner+co-owner, handler+co-owner, all-three, zero-entry. Authorization: tampered client cannot favorite entries that aren't theirs (RPC takes no parameters, enforced by `auth.uid()`); unauthenticated call returns empty.
   - Show-creation backfill test: creating a new show via `create_show_with_children` inserts 4 `show_passcodes` rows; deleting a show cascades them away; the data migration's per-show backfill produces 4 hashed rows for every pre-existing show with none.

### Phase 1 — Smart-input landing + `/at-show` route

1. Add `/at-show` route to `apps/myk9show/src/routes/publicRoutes.tsx`, lazy-loaded via `React.lazy`, rendering the shared ringside package inside myK9Show's app shell. Add a bundle-size budget assertion to CI.
2. Add homepage smart-input landing per the "Smart-Input UX" section: single field with live disambiguation, discoverability copy, `/help/credentials` link, autocomplete attributes, focus management, aria-live regions, submit gating, server-side rate limiting + enumeration-resistant errors.
3. Add the post-credential routing table targets, including the **admin (`a\*\***`) route\*\* to the existing admin/show-management UI.
4. Wire the passcode flow into myK9Show's auth context so it coexists with the account session per Locked Decision 8 (signed-in user typing a passcode sees the confirmation step before role attaches).
5. Create `/help/credentials` docs page. Broken link = ship blocker.
6. **Rebrand `MyK9QAccessCard`:** rename to "Show Access Codes" (or similar), replace `myk9q.com` URLs with `myk9show.com`, update header copy. Cross-check secretary print previews.
7. **Tests:** Playwright spec exercising the four passcode shapes (`s****`, `e****`, `j****`, `a****`), account sign-in, signed-in-user-types-passcode confirmation, and the unrecognized-input error path. Unit tests for shape detection (email vs passcode vs invalid, with case/whitespace/zero-width normalization). Manual verification of password-manager autofill on iOS Safari and Chrome desktop.

### Phase 2 — Account-holder show-day auto-routing

1. Implement "Show today" banner on myK9Show homepage. Single CTA when one show today; stacked list ordered by earliest class time when multiple; hidden when zero.
2. Implement auto-favorite logic: on banner-tap or `/at-show` mount, call `get_account_today_entries()` (no parameters — RPC derives identity from session) and pre-favorite the returned IDs. Client never receives or trusts unrelated entry IDs.
3. **Tests:** unit tests covering owner-only, handler-only, co-owner-only, owner+handler, owner+co-owner, handler+co-owner, all-three, and zero-entry cases. Playwright spec covering banner appearance (single, multi, zero) + auto-favorite assertion. Authorization Playwright: account A attempts to favorite an entry owned by account B → RLS denial.

**Implementation note (2026-05-30):** Phase 2 client work is implemented in `apps/myk9show/src/features/show-today`: homepage banner selection, banner tap routing, replicated-data hydration from `get_account_today_entries()`, and class-favorite persistence for `/at-show`. Unit/component coverage exists for zero/single/multi banner states, owner/handler/co-owner RPC-result hydration permutations, and the "route even if pre-favorite cannot complete" fallback. Playwright/UAT authorization coverage remains the Phase 2 gate before marking the phase fully accepted.

### Phase 3a — Recipient identity (extend fanout to reach passcode users)

> **Implementation status (2026-05-30):** Implemented in branch `codex/phase-3-unify-ringside`. Adds `ringside_sessions`, expands `send-targeted-message` recipient resolution for class / checked-in / all-show sends, and adds secretary target options. Deployment-time DB migration review and pilot UAT remain required before advancing to Phase 4.

This phase has no push delivery — it only fixes who the fanout _would_ target. Push delivery is Phase 3b.

**Note:** Phase 3a creates the `ringside_sessions` table (this is the right phase for that schema since 3a is the first phase that queries it). Phase 3b's remaining work is the heartbeat, the RLS + write-path RPC, push delivery, and suppression.

1. **Migration:** create `ringside_sessions` as defined in the Messaging Architecture section (columns include `show_passcode_id` FK to `show_passcodes`). The table is created here; Phase 3b adds the write-path RPC + RLS that govern who can write to it.
2. Extend `send-targeted-message` recipient resolution to query both:
   - Account-keyed: existing `entries → dogs → people.auth_user_id` arm
   - Passcode-keyed: `ringside_sessions` joined to `push_subscriptions` filtered by `show_id`, `role`, and `favorited_armbands ∋ target_armband` for per-armband targets; `(show_id, role)` for role broadcasts (the `show_passcode_id` column makes the underlying identity explicit but the join can also use `role + show_id` for broadcast queries)
3. Add "Everyone checked in" recipient resolver (via checked-in entry list) and "Everyone in show" target (via `group_label`) to the existing edge function.
4. Add "Everyone checked in" and "Everyone in show" target options to `SecretaryMessagesPage`'s `ComposeTargetedModal`.
5. **Tests:** edge function unit tests confirming each target shape returns the correct recipient set including passcode users. Specific regression test: a passcode-only exhibitor with a `ringside_sessions` row favoriting an armband receives a per-class message.

### Phase 3b — Push delivery + presence-aware suppression

> **Implementation status (2026-05-30):** Implemented with the Phase 3a branch behind `PUSH_FANOUT_ENABLED=false` by default. Adds presence RPCs, route heartbeat, stale-session pruning, passcode-session push fanout, stale-subscription cleanup, retry-on-5xx, and suppression for fresh `/at-show` presence. Full E2E push verification still requires a deployed edge function, VAPID secrets, and a pilot show.

> **Pilot verification status (2026-05-31):** Deployed synthetic transport pilot passed against Supabase project `sojmvhhwsjxmfistvzbe` and show `Headline` / class `Container Novice A`. Preflight confirmed migration `20260530210555`, `upsert_ringside_session`, `clear_ringside_session_presence`, `prune_stale_ringside_sessions`, VAPID secrets, and `send-targeted-message` deployed with `verify_jwt=false`. Two deployment blockers were fixed before the pilot: `send-targeted-message` now reads `push_subscriptions.p256dh/auth` instead of a non-existent `keys` column and authorizes senders through `user_roles.auth_user_id`; `notify_chat_message()` now skips optional pg_net fanout when DB app settings are absent instead of rolling back inbox writes. With `PUSH_FANOUT_ENABLED=false`, the edge function returned `sent_to=1`, `total_recipients=5`, `push_sent=0`, `push_suppressed=4`, `push_failed=0`, `dead_subs_cleaned=0`. With fanout temporarily enabled, it returned `sent_to=1`, `total_recipients=5`, `push_sent=2`, `push_suppressed=1`, `push_failed=0`, `dead_subs_cleaned=1`. The two sent targets covered account-keyed and passcode-keyed ringside sessions; the suppressed target had fresh `/at-show` presence; the dead target was deleted. `PUSH_FANOUT_ENABLED` was restored to `false`, and synthetic push subscriptions were cleaned up. Remaining acceptance gap: no real browser/device push tap was available because staging had zero existing push subscriptions, so "tap opens inbox thread" still needs a real-device pilot before Phase 4 sunset work starts.

1. **Schema:** the `ringside_sessions` table is created in Phase 3a step 1 (so its presence unblocks the fanout query). Phase 3b's schema work is the RLS policies and the write-path RPCs. Direct INSERT/UPDATE/DELETE on `ringside_sessions` is **denied for all client roles** — including authenticated users. SELECT is allowed only for the service role (edge function context) and site admins. All client writes go through the `upsert_ringside_session(...)` `SECURITY DEFINER` RPC, which validates the credential by calling `validate_passcode(...)` for anonymous callers (the returned `{show_id, role}` is server-derived; client never controls it) OR verifying `auth.uid()` matches the subscription's `user_id` for signed-in callers. This is the resolution for the cross-identity write path: passcode users have no `auth.uid()`, so account-based RLS would lock them out; routing all writes through the RPC unifies the path while keeping `show_id` and `role` derivation server-side so a tampered client cannot spoof attachment to a different show or escalate role.
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
    - **RPC authorization tests:** anonymous caller with valid passcode → upsert succeeds with correct `show_id`/`role` derived from `show_passcodes`; anonymous caller with invalid passcode → rejected (generic error); authenticated caller upserting for a subscription they don't own → rejected; cross-identity attack (passcode argument provided AND `auth.uid()` present, with mismatched `user_id` on the subscription) → rejected; spoofing attempt (caller tries to pass `show_id` or `role` to the RPC — the parameters don't accept them, so the test confirms the function signature itself enforces this).
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

> **Implementation status (2026-06-04):** Implemented in branch `codex/phase5-branding-copy`. Homepage now contains the one approved Q-lineage sentence and otherwise presents the unified product as myK9Show + Ringside. User-facing myK9Show copy was swept across landing, FAQ, legal, install, and armband-label surfaces; the old standalone landing callout was removed. Smart-input touch targets were raised to 44px minimum and label/hint relationships were tightened. Focused coverage added: homepage copy snapshot, user-facing branding grep guard, smart-input accessibility assertions, label-preference migration, and install/label copy tests.

1. Add homepage copy hinting at Q lineage: _"the ringside experience you may know as myK9Q, now built right in"_.
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

- Phase 0 (extraction + `show_passcodes` migration + backfill) blocks all subsequent phases. The backfill regenerates codes for any existing shows; secretaries must re-issue the new codes to their volunteers before Phase 1.
- Phases 0–2 ship behind `shows.unified_ringside_enabled` per show. Pilot with one club's show before global enable.
- Phase 3a (recipient identity) ships dark — no behavior change for users, only the resolver expands.
- Phase 3b ships with `PUSH_FANOUT_ENABLED=false` initially. Flip to true for the pilot show only. Once stable for two clean shows, flip globally.
- Phase 4 sunset happens after the pilot show plus one more clean show. As of the 2026-05-31 synthetic transport pilot, the Phase 4B live sunset/redirect flip remains blocked on a real browser/device push-tap verification. Phase 4A code cleanup may remove duplicate myK9Show surfaces once `/at-show` has replacement coverage; dormant Phase 4B prep may ship behind an off-by-default environment flag.
- Phase 5 copy/branding ships independently and is safe to revert.
- Phase 6 deletion waits at least 30 days after the Phase 4 redirect is live.

## Change log

- **2026-05-17** — Initial plan.
- **2026-05-25** — Smart-input addendum merged in. Locked Decision 2 replaced; Locked Decisions 8–10 added. Phase 3 split into 3a (recipient identity) + 3b (push delivery). Admin (`a****`) routing added. Legacy passcode format made a Phase 0 prerequisite. Auto-favorite resolver predicate spelled out with `co_owner_id`. `MyK9QAccessCard` rebrand moved from Phase 5 to Phase 1. Presence storage columns added to `push_subscriptions` (corrects original "no schema changes" assumption).
- **2026-05-25 (revision 2)** — Second review applied. Presence + role + per-show favorites moved off `push_subscriptions` into a new `ringside_sessions(subscription_id, show_id, role, favorited_armbands, last_seen_at, last_seen_route)` table (separates per-device push state from per-(device, show) ringside state). Replaced fictional `profiles.unified_ringside_preview` with a real `feature_flag_overrides` table keyed on `people.id`. Tightened RPC signature to `get_account_today_entries()` with no parameters (derives identity from `auth.uid()` to remove IDOR surface). Fixed misleading citation about `push_subscriptions` join surface — the _indexes_ on `user_id`/`license_key` exist, but the _columns_ for role/favorites do not; they live on the new table.
- **2026-05-25 (revision 3)** — Third review applied. Added explicit Risk/Validation profile to the document header (High risk, Full validation). Default for the legacy-passcode Phase 0 prerequisite flipped from "decide A or B based on size" to "default to A unless the audit proves zero codes are distributed"; option B now requires a 60-day parallel-acceptance window plus secretary re-issue when chosen. Note: the third reviewer's findings #1, #2, #3 (schema, RPC parameter, profiles table) were already addressed in revision 2; the reviewer was looking at the consolidation commit before revision 2 had landed locally for them.
- **2026-05-25 (revision 4)** — Fourth review applied. **Critical architectural fix:** added Locked Decision 11 establishing a `SECURITY DEFINER` RPC (`upsert_ringside_session`) as the unified write path for `ringside_sessions`. Anonymous passcode users have no `auth.uid()`, so the prior account-based RLS would have silently locked them out of writing — making the unification's headline persona invisible to the push fanout. The RPC validates a passcode argument OR `auth.uid()` ownership before upserting; direct table writes are denied. Also added: explicit RLS rules for `feature_flag_overrides` (users read own, admins read/write all), a scheduled cleanup function `prune_stale_ringside_sessions()` for ended-show and abandoned-session rows, and corresponding RPC-authorization + cleanup tests. Fixed stale out-of-scope bullet that claimed `push_subscriptions` was the touched schema.
- **2026-05-25 (revision 5)** — Passcode identity model rewritten. Per product decision, the platform abandons the myK9Q license-key derivation in favor of **4 independently random codes per show, generated at show creation and stored hashed in a new `show_passcodes` table**. Shape unchanged (`[a|j|s|e][4 random a-z0-9]`); storage changes from `mobile_app_lic_key`-derivation to per-(show, role) row lookup. New RPCs: `validate_passcode(code)` returns `{show_id, role}` server-derived; `upsert_ringside_session` no longer trusts a client-supplied `show_id` — it derives identity from the passcode or `auth.uid()`. Phase 0 prerequisite (legacy passcode audit) eliminated; replaced with a backfill that regenerates codes for any existing shows and a secretary re-issue step. `ringside_sessions` gains an `show_passcode_id` FK so passcode-keyed identity is explicit. The legacy `mobile_app_lic_key` column on `shows` becomes vestigial and is left in place for a post-Phase-6 cleanup migration. Security improvement: an attacker who learns one role's code learns nothing about the other 3.
- **2026-05-25 (revision 6)** — Hashing algorithm pinned. The Phase 0 implementation surfaced a contradiction in revision 5: storing codes with bcrypt/argon2id is incompatible with the canonical `validate_passcode` path's indexed equality lookup (slow hashes use per-row random salts, so two hashes of the same input never match by equality). Replaced with **HMAC-SHA256 + Supabase Vault pepper**: deterministic so the lookup stays O(log N) via a btree on `passcode_hash`, and the pepper held outside the DB still gives "DB compromise doesn't leak codes" without requiring a slow-hash scan. Added a dedicated `insert_show_passcodes(p_show_id, p_codes jsonb)` SECURITY DEFINER RPC so the pepper never leaves the database (clients pass plaintexts; the function hashes server-side). Added `regenerate_show_passcodes(p_show_id)` because the SQL-only backfill cannot return plaintexts to anyone — secretaries of pre-existing shows must explicitly regenerate before distributing. Updated Phase 0 test list to cover the deterministic-HMAC implications (identical plaintexts in two shows both validate; the UNIQUE constraint is on `(show_id, role)`, not `passcode_hash`).
- **2026-05-31 (Phase 3 pilot verification)** — Deployed DB/function preflight and synthetic transport pilot completed. Applied follow-up migrations to restrict `prune_stale_ringside_sessions()` execute to `service_role` and to guard `notify_chat_message()` when DB app settings are absent. Redeployed `send-targeted-message` with schema-correct push subscription selects and robust sender authorization. Synthetic fanout proved account + passcode push sends, fresh `/at-show` suppression, stale subscription cleanup, inbox persistence, and response counts; real-device tap-to-inbox remains required before Phase 4.
- **2026-06-01 (Phase 4A split)** — Phase 4 split into safe code cleanup and gated sunset. Phase 4A can remove legacy myK9Show duplicate routes/pages (`ShowDayPage`, `ClassCheckInPage`, `useShowDayAlerts`) now that `/at-show` owns the ringside show-day surface. Phase 4B remains gated on real-device push-tap acceptance before changing the standalone myK9Q deployment or origin migration behavior.
- **2026-06-01 (Phase 4B prep)** — Dormant myK9Q sunset mode prepared behind `VITE_MYK9Q_SUNSET_ENABLED=true`. Default deployment behavior remains unchanged. When the flag is enabled later, myK9Q renders a handoff page before legacy app initialization, preserves passcode query strings, and links to myK9Show `/at-show`. The live Vercel environment flip remains a separate approval-gated step after real-device push-tap acceptance.
- **2026-06-02 (Phase 3b push-tap routing fix)** — Real-device testing showed an account exhibitor tapping a secretary-message push landed on the `/at-show` ringside surface instead of their message thread. Root cause: `send-targeted-message` emitted a single `actionUrl` (`/at-show/...`) for every recipient via `buildRingsidePushActionUrl`. Fixed by making the push `actionUrl` identity-aware — the ringside push select now reads `push_subscriptions.user_id`, and a new pure `buildTargetedMessageActionUrl(showId, subscription, session)` routes **account-keyed** subscriptions (`user_id` set) to `/messages/:showId` (the exhibitor inbox thread / `ChatPage`) while **passcode** subscriptions (`user_id` null) keep the `/at-show` resolution. The `upsert_ringside_session` RPC already guarantees the account/passcode split on `user_id` (anonymous callers are rejected if the subscription carries a `user_id`). Edge-function unit tests cover both branches; the SW `notificationclick` consumer is unchanged. Deployment of `send-targeted-message` + a real-device retap remain to close the Phase 3 acceptance item.
- **2026-06-02 (Phase 3b account push by entry)** — Real-device testing surfaced that signed-in exhibitors were not being notified unless they favorited an armband — a passcode-era requirement. For an account user we already know their entries (`auth_user_id`), so `send-targeted-message` now also fans out push to **entered account exhibitors' own `push_subscriptions`**, resolved from `accountRecipientIds` (the same set that already receives the inbox thread). New helpers in `targeting.ts`: `ACCOUNT_PUSH_SUBSCRIPTION_SELECT`, `accountPushSession` (synthetic non-suppressing session — account devices route to `/messages` via `user_id`), and `mergePushTargetsBySubscriptionId` (dedupes account vs ringside targets, ringside winning so presence-suppression still applies to anyone actively at `/at-show`). Net: an entered exhibitor is notified by their entry — no favoriting, no passcode — while passcode users are unaffected. Chosen over enabling the `notify_chat_message` pg_net trigger to avoid storing the service-role key as a DB GUC and to keep delivery in one function. **Caveat:** if `notify_chat_message` is later enabled for the secretary→exhibitor path, account recipients would get a duplicate push (trigger + this fan-out) — scope that trigger to replies, or dedupe, when wiring it up. Unit-tested; deploy of `send-targeted-message` still required.
- **2026-06-04 (Phase 5 branding sweep)** — Phase 5 implemented. User-facing unified app copy now uses "Ringside" / "At the show" instead of the Q identity except for the one approved homepage lineage sentence. Install prompt/settings copy now speaks to the at-show audience, armband labels print "Show code", legal/FAQ/meta copy reflects one myK9Show service, and a user-facing branding grep guard plus homepage snapshot prevent regressions. Smart-input accessibility pass raised email/passcode/password/buttons to 44px minimum, restored keyboard access for password visibility, and tied the credential input to hint/help/error text.
