# Stripe Go-Live Enforcement — capacity gate + waitlist Phases 7/8

> **Status:** Active

Closes the three functional gaps that stand between the shipped capacity/waitlist machinery and a launch-ready paid-entry pipeline. Grounded in a 2026-07-11 code survey; file references verified against `main` on that date.

**Scope notes (duplication check, per CLAUDE.md):**

- The *operator* Stripe live-mode cutover is NOT this plan — it already exists as [operations/go-live-runbook.md](operations/go-live-runbook.md) Phase 3 (steps 3.1–3.10) + [operations/stripe-platform-setup.md](operations/stripe-platform-setup.md). Do not re-author it.
- The AKC/UKC PDF AcroForm work is NOT this plan — it is substantially shipped (`apps/myk9show/src/features/organization-forms/`, pdf-lib fill live for AKC/UKC/ASCA) and the remaining static→filled conversions are tracked in the active openspec change `ukc-closeout-packet`. Do not create a parallel plan.
- This plan covers only: (A) capacity enforcement in `submit_show_entries`, (B) waitlist Phase 7 (in-app promotion payment), (C) waitlist Phase 8 (waitlist push notifications). Original phase definitions: [archive/plans/2026-04-02-wait-list-implementation.md](archive/plans/2026-04-02-wait-list-implementation.md) (Phase 7 at L1184, Phase 8 at L1325).

## Current state (verified)

**Built and working:**

- Capacity model: `shows.default_judge_day_capacity` (125), mail-in reserve strategies, `judge_assignments.day_capacity_override` (migration `114_wait_list_capacity.sql`).
- One authoritative capacity formula: `get_judge_day_capacity_live()` (VOLATILE, service-role, must be called after the `judgeday:<judge>:<date>` advisory lock; `20260628202146` + `20260629015413` unify the display helper onto it).
- `create_online_paid_entry(...)` — the capacity gate: per-judge advisory lock → live capacity read → `created_entry` | `waitlisted` | `denied`. Sole caller: `stripe-webhook` `checkout.session.completed` (paid-cart shape), with auto-refund of denied/waitlisted cart shares.
- Promotion engine: `promote_waitlist_entry_internal` (advisory locks, re-checks class + judge-day capacity, creates `pending-payment` entry, stamps `offer_expires_at`), authz wrapper for secretary/club-admin/site-admin, cron wrapper for service role.
- Expiry: `cron-waitlist-expiration` (every 15 min) expires lapsed offers (`pending-payment` → `promotion-expired`, Stripe session expired via `entry_payment_links`), auto-offers next in line, emails the offer with a Stripe link (`stripe-payment-link` via `x-function-secret`). `'paid'` outcomes are protected from expiry (reconciliation bucket — see memory: entry-paid-bucket decision).

**Gaps (this plan):**

- **A.** `submit_show_entries` RPC (`151_submit_show_entries_rpc.sql` lineage, latest guard `20260708130000_guard_submit_show_entries_entry_close.sql`) has **no capacity check at all** — only entry-close. Any non-paid-cart submission path (mail-in, secretary-entered, pay-later) can oversell a judge-day.
- **B.** Phase 7: no in-app payment surface for a promoted exhibitor. `/entries/:entryId/complete-payment` route and `WaitListPaymentPage` don't exist; the only payment path is the cron email's Stripe link. No decline flow, no halfway reminder.
- **C.** Phase 8: `push-trigger-waitlist` edge function doesn't exist; `useWaitListMutations.promoteEntry` sends no notification of any kind (secretary-initiated offers are email-silent until the next cron sweep — and the cron only emails offers *it* creates).

## Phase A — capacity enforcement in `submit_show_entries`

**Design decision (settle before coding):** `create_online_paid_entry` creates entries as `paid`; `submit_show_entries` creates unpaid/submitted entries. Reuse the *lock + live-read* core, not the whole function. Extract the per-judge check into a helper both callers share.

1. New migration: `assert_judge_day_capacity(p_class_id uuid, p_show_id uuid)` (or set-returning variant for multi-class submits) — SECURITY DEFINER, `search_path=''`, service-role + authenticated-via-RPC execution only. For each judge/date implied by the class: take `judgeday:` advisory lock (same key derivation as `create_online_paid_entry` — byte-identical hashing, or the locks don't exclude each other), then `get_judge_day_capacity_live()`. On zero spots: if class `allow_waitlist`, insert `waitlist_entries` row (`joined_via` per source) and return `waitlisted`; else raise/return `denied`.
2. Wire into `submit_show_entries`: after the entry-close guard, before entry insert. Return shape must surface per-class outcomes (`created | waitlisted | denied`) so the UI can tell the exhibitor which classes waitlisted. Keep the whole submit transactional — locks release at commit, which is what makes the check race-free against the webhook path.
3. Frontend: `submitShowEntries` caller + entry-cart UI handle the new outcome variants (waitlisted confirmation state, denied messaging). Mirror the language the paid-cart flow already uses for `waitlisted_cart_item_ids`.
4. Decide + document mail-in behavior: secretary/mail-in submissions likely bypass the *online* capacity portion but consume the mail-in reserve; encode via a `p_source` argument rather than a second RPC.

**Risks:** advisory-lock key drift between the two callers (test with concurrent transactions); double-waitlisting (the `waitlist_entries_active_class_dog_key` unique partial index is the backstop — handle its conflict as "already waitlisted", not an error).

## Phase B — waitlist Phase 7: in-app promotion payment

**Implementation status (2026-07-13):** complete locally on `codex/stripe-waitlist-payment-decline`; awaiting PR approval, CI, migration/function deployment approval, and staging evidence.

1. Reuse the existing My Entries `WaitListSection` — no new route, payment page, or card form. An offer deep-link focuses the owned row and preserves the active My Entries workflow.
2. Complete payment invokes the existing `stripe-payment-link` for the promoted entry and returns to the same owned offer. The narrow exhibitor path verifies every requested entry belongs to an active, unexpired offer; existing organizer/internal authorization, pricing, Connect readiness, redirect checks, link replacement, and webhook reconciliation remain authoritative.
3. Decline uses the authenticated `decline-waitlist-offer` Edge Function. It verifies ownership, shares the Stripe-session expiry flow, fails closed on paid or uncertain payment state, and is idempotent for terminal offers; the existing expiry/cascade system continues to own next-offer progression.
4. A database trigger blocks payment-link creation for promoted entries unless the corresponding offer is active, unexpired, and awaiting payment.
5. The existing waitlist section shows countdown, Complete payment, Decline, calm retry states, reconciled/terminal explanations, and 44px controls. Once a device clock reaches an offer deadline, it hides actions and revalidates server state instead of claiming expiry locally.
6. Phase C owns halfway reminders and notification delivery; Phase B consumes its offer deep links without adding another surface.

## Phase C — waitlist Phase 8: push notifications

1. New edge function `supabase/functions/push-trigger-waitlist/index.ts` following the `push-trigger-announcement` pattern exactly: bearer `push_webhook_secret` (fail-closed via `requirePushWebhookSecret`), payload `{type: 'promoted'|'reminder'|'expired', waitlist_entry_id, show_id}`; resolve the exhibitor's `auth_user_id`, fetch `push_subscriptions` chunked, send Web Push with deep link to `/entries/:id/complete-payment`.
2. DB trigger on `waitlist_entries` `AFTER UPDATE OF status WHEN (new.status = 'offered')` → `net.http_post` to the function using Vault `edge_function_base_url` + `push_webhook_secret` (pattern: `20260703122000_push_trigger_webhook_secret.sql`). Trigger-based (not `functions.invoke` from the mutation) so cron-initiated and secretary-initiated offers both notify — this supersedes the original Task 16 client-side wiring.
3. `reminder`/`expired` pushes fired from `cron-waitlist-expiration` directly (it already has service-role context; no trigger needed).
4. Deploy note: root-tree function → deploy from repo root with explicit `--project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt`; seed `PUSH_WEBHOOK_SECRET` (no service-role-key fallback for a new function).

## Phase D — testing (required; no phase is complete without it)

- **A:** pgTAP-style or SQL-run migration tests are not in the repo's idiom — instead: (1) unit tests on the new RPC return-shape mapping in the frontend service; (2) **assertion-first** vitest on `submitShowEntries` callers pinning the exact outcome enum strings (memory: assertion-first for value-sensitive bugs); (3) a live-DB rolled-back psql transaction verifying `denied`/`waitlisted` outcomes with a saturated judge-day (pattern: memory live-rpc-authz-verification); (4) concurrency probe: two parallel transactions submitting into one remaining spot — exactly one `created`.
- **B:** vitest for `WaitListPaymentPage` (countdown math, expired-offer state, decline flow) using `src/test/utils/testUtils.tsx` custom render; source test pinning `stripe-payment-link` request body per existing `*.source.test.ts` idiom; e2e happy-path if the playwright seed supports an offered waitlist row.
- **C:** source tests on `push-trigger-waitlist` mirroring `push-trigger-announcement`'s tests (secret fail-closed 503/401, payload validation); migration audit via `migration-auditor` agent before push (GRANTs, trigger search_path).
- Full suite: `pnpm typecheck`, `pnpm lint`, `cd apps/myk9show && pnpm test` green before each phase's PR.

## Sequencing & sizing

A → C → B (A is the launch-blocking overselling risk; C is small and makes B's emails/pushes coherent; B is the largest UI surface). Each phase is one PR from its own worktree. Estimated: A ~1 day, C ~half day, B ~1.5 days including tests. Codex review ON for all three (payment flow / gates / RLS-adjacent — memory: codex-review-default-on).
