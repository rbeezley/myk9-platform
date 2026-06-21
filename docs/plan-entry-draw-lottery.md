# Entry Draw / Lottery — random-draw intake for over-subscribed shows

> **Status:** Active

> **Depends on:** [`docs/plan-entry-payment-request.md`](plan-entry-payment-request.md). This plan reuses that plan's pay-to-claim primitive (payment links for unpaid entries, webhook reconciliation, waitlist cascade, offline-for-mail-in promotion, transparency surfaces). Do NOT start draw implementation until the pay-to-claim spine exists.

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Checkbox (`- [ ]`) steps. Touches payment/Stripe + a fairness-critical randomization path — run `/codex:review` alongside `/review`, and treat the draw's auditability as load-bearing.

**Goal:** Offer clubs a **random-draw (lottery) entry mode** as an alternative to first-come-first-served for over-subscribed shows. Every entry received by the closing date — online *and* secretary-keyed mail-in — has equal odds; a seeded, auditable draw fills capacity and orders the waitlist. This neutralizes both the online-opening-rush and the mail-delay disadvantage in one mechanism.

**Why this is fair (and why it exists):** "Fastest internet wins" and "fastest mail wins" are the two loudest entry complaints. A draw removes both. It is arguably *more* fair to the retired/mail-in population than the FCFS + mail-in-reservation model, because a mailed entry that arrives by closing has identical odds to an online one — no reservation needed.

## Architecture — reuse, do not rebuild

The key realization: **a draw is incompatible with charge-at-entry** (you don't know who's in until closing, weeks later; Stripe auth holds expire in ~7 days so authorize-and-capture-later won't span it). So draw mode **defers the charge entirely** — which means it is just *"every entry is pending until closing, then the drawn-in entries are promoted"*. That is exactly the pay-to-claim flow the dependency plan builds:

- Draw mode entries are created **pending, no charge** (online checkout suppressed — register intent, don't pay).
- At closing, the draw promotes the winners → each gets a **payment link** (pay-to-claim, same 48h-online / offline-for-mail-in rules).
- Non-drawn entries become the **waitlist in drawn order**; the existing `cron-waitlist-expiration` cascade fills no-shows.

So this plan is mostly an **intake + ordering layer** on top of existing primitives — plus one genuinely new, fairness-critical piece: the auditable draw itself.

**Tech Stack:** Supabase Edge Functions / RPC (Deno + Postgres), React + TypeScript, Vitest + RTL, shadcn/base UI.

---

## Context

- **Entry "draw"** = entry lottery for over-subscribed/limited shows (the impactful meaning), not merely randomizing waitlist order (that falls out for free once the draw orders the losers).
- **Reuses from the dependency plan:** `stripe-payment-link` + webhook reconciliation, `promote_waitlist_entry`-style atomic promotion, `cron-waitlist-expiration` cascade, offline-payment-for-mail-in, and the Task 5.5 transparency surfaces (position, notifications).
- **Capacity model:** judge-day capacity already exists (migration 114, `get_judge_day_capacity`). The draw fills up to capacity.
- **Intent (`docs/INTENT.md`):** exhibitor feeling = "this is fair and I'm not being cheated." A draw only delivers that if it is *provably* fair — auditability is a feature requirement, not a nicety.
- **Refund note:** in draw mode nobody is charged until drawn AND paid, so there is no charge-then-refund cycle for non-drawn entrants (same fairness win as the waitlist).

## Out of scope / non-goals

- Authorize-at-entry / capture-later (Stripe hold expiry makes it unworkable across a weeks-long entry window).
- Replacing FCFS — draw is an *opt-in per-show mode*, FCFS stays the default.
- Voluntary/cancellation refund policy — still the deferred sibling item in `OPEN-TODOS.md`.

## Open questions to resolve in Task 1 (do not guess)

- [ ] **Draw vs mail-in reserve relationship (DEFERRED to this plan's design — owner, 2026-06-20).** Decide: (a) **per-show pick-one** — a show is FCFS+reserve OR draw, and choosing draw makes the reserve moot (simplest, matches how clubs think); vs (b) **compose** — draw the online pool for `capacity − reserved` and a separate mail-in pool for the reserved spots (guarantees mail-in representation *and* fairness within each channel, more complex). Default to (a) unless a real club needs (b).
- [ ] **Closing trigger:** cron fires the draw at the show's closing datetime, vs secretary-triggered with confirm. Auditability favors a single logged trigger; consider "cron arms it, secretary confirms" to avoid a surprise auto-draw.
- [ ] **Randomization + audit method:** seeded shuffle with stored seed + full ordered result; ideally **commit-reveal** (publish a hash of the seed before closing, reveal after) so no one can re-roll. Confirm a CSPRNG source available server-side (note: workflow/script `Math.random` is unavailable in some sandboxes — this runs in an edge fn/RPC, not a workflow script).
- [ ] **Multi-dog / per-person rules:** default = each entry drawn independently. Decide whether any club wants "don't draw a 3rd dog from one person before everyone has one" (advanced; likely defer).
- [ ] **Mail-in cutoff for inclusion:** the secretary must key all mailed entries *before* the draw runs, so closing needs a buffer. Define the operational window and a "ready to draw?" checklist.

## Files (provisional — confirm in Task 1)

- Migration: `shows.entry_mode text NOT NULL DEFAULT 'fcfs' CHECK (entry_mode IN ('fcfs','draw'))` (+ any per-judge-day override if needed); a `draw_runs` audit table (show/judge-day, seed, seed_hash, run_at, ordered entry ids, run_by) with GRANTs + RLS. Run `migration-auditor`.
- Edge fn / RPC: `run_entry_draw` (server-side, atomic, seeded, writes the audit record, promotes winners, orders the waitlist).
- Modify the entry-intake (cart/`stripe-checkout` path + secretary entry) to create **pending, no-charge** entries when `entry_mode='draw'`.
- Reuse: `stripe-payment-link`, webhook reconciliation, cascade cron, transparency surfaces (from the dependency plan).
- Tests: see Task 6.

---

## Task 1: Recon + design lock (no code)

- [ ] Resolve every Open Question above (reserve relationship, closing trigger, randomization/audit method, multi-dog rules, mail-in cutoff). Write the decisions back into this plan.
- [ ] Confirm the dependency plan's pay-to-claim primitive is implemented (this plan can't promote-with-link without it).

## Task 2: Entry-mode config

- [ ] Migration: `shows.entry_mode` (+ override granularity if Task 1 requires). GRANTs/RLS; `migration-auditor`.
- [ ] Secretary config UI: pick FCFS vs draw per show (extend `WaitListSettingsCard` / show settings — do not add a new page). Surface the closing date prominently (the draw hinges on it).

## Task 3: Deferred-charge intake (draw mode)

- [ ] When `entry_mode='draw'`, entry submission (online cart AND secretary) creates a **pending entry with no charge** — suppress the Stripe checkout step; the exhibitor registers intent and is told "entries close [date]; a random draw decides spots; you'll get a payment link if drawn."
- [ ] Ensure online entrants are NOT charged at submit in draw mode (the single biggest correctness risk — assert it in tests).

## Task 4: The draw (fairness-critical)

- [ ] **Step 1 (assertion-first test):** given N pending entries and capacity C, `run_entry_draw` produces a deterministic order for a fixed seed, fills exactly C winners, orders the rest as the waitlist, and writes a complete audit record — red first.
- [ ] **Step 2:** Implement `run_entry_draw` server-side (edge fn/RPC), atomic, using a CSPRNG-seeded shuffle. Store seed, seed hash, run timestamp, runner identity, and the full ordered entry-id list in `draw_runs`. Idempotent: a show/judge-day can only be drawn once (re-run requires an explicit, logged override).
- [ ] **Step 3:** Commit-reveal — publish the seed hash at/just before closing; reveal the seed after the draw so the result is independently verifiable. (Confirm exact mechanism in Task 1.)
- [ ] **Step 4:** Apply capacity per the Task 1 reserve decision (pick-one vs compose).

## Task 5: Draw → pay-to-claim + waitlist (reuse)

- [ ] Winners are promoted exactly like a waitlist promotion: payment link (online) or offline-for-mail-in, on the configured window; non-payers cascade to the next drawn entry via the existing cron.
- [ ] Losers become the waitlist **in drawn order** (so the existing cascade is fair by construction).

## Task 5.5: Transparency (reuse + extend)

- [ ] Exhibitors see their **draw position / outcome** (drawn-in vs waitlist #k), reusing the dependency plan's Task 5.5 surfaces.
- [ ] Publish the **draw method + audit** (seed hash before, seed after) so the result is provably fair — this is the anti-"secretary's-friends-always-win" safeguard.

## Task 6: Testing phase (required)

- [ ] `run_entry_draw` determinism (fixed seed → fixed order), exact capacity fill, complete audit record, single-run idempotency.
- [ ] Draw-mode intake creates pending NO-CHARGE entries (online not charged at submit) — assert it.
- [ ] Winners get payment links / offline-for-mail-in; non-payers cascade in drawn order.
- [ ] Commit-reveal: seed hash matches revealed seed; tampering is detectable.
- [ ] Reserve interaction per the Task 1 decision (pick-one or compose).
- [ ] `cd apps/myk9show && pnpm test` + `pnpm typecheck` green before done.

## Rollout / verification

- [ ] Stripe test-mode end-to-end: draw-mode show, over-subscribe it, run the draw, confirm winners get links + pay, losers waitlist in drawn order, non-payer cascades. Use `/stripe:test-cards`.
- [ ] Verify the audit record is complete and the draw is reproducible from the stored seed.
- [ ] `/codex:review` + `/review`; migrations via `migration-auditor` + confirm before `db push`.

## Done when

- A club can set a show to random-draw; entries collect with no charge until closing; a seeded, auditable draw fills capacity and orders the waitlist; winners pay via the existing pay-to-claim flow (offline-friendly for mail-in); the draw is provably fair (commit-reveal + stored audit) and exhibitors can see their outcome; all tests + typecheck green; reviewed.
