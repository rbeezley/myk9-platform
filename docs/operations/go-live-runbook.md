# Go-Live Runbook — myK9Show Fall 2026 Launch

> **Status:** Active
> **Last reconciliation:** 2026-07-10. Only items with repo/tracking evidence proving
> 100% completion are checked; operator-only dashboard, venue, live-money, and real-user
> evidence gates remain open until re-verified at execution time.

**The single ordered, gated launch document.** Consolidates every operator-executable step
previously scattered across OPEN-TODOS.md, the launch-execution-lanes plan, and the
`docs/operations/` runbooks. Execute phases **in order**; each phase has an entry **gate** that
must be verified true before starting it. Detailed procedures stay in their source runbooks —
this document is the sequence, the gates, and the verification commands.

**Owners:** `Operator` = Richard (dashboard/venue/human actions). `Agent` = Claude/Codex session
(code, migrations, deploys — shared-system mutations still confirmation-gated per CLAUDE.md).

**Project ref:** `sojmvhhwsjxmfistvzbe`. Migration password: `supabase/.env`.

---

## Gate summary (the launch decision at a glance)

| #   | Gate                                                                                         | Blocks                   | Status check                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | Security remediation deployed (including 2026-07-10 SA-018…023/026/027)                      | Phase 1                  | `security-audit-remediation` merged, migration/function deployment recorded, and `OPEN-TODOS.md` updated                                                                                                                                                                                                                                                                                                                                                                           |
| G2  | Pending deploys/migrations reconciled (`ask-myk9show`, withdrawal migrations, edge-fn drift) | Phase 1                  | Phase 0 verification commands below                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| G3  | Money-path hardening Phases 1–3 merged + deployed (MP-01…MP-04)                              | Phase 3 (Stripe cutover) | [`docs/plan-money-path-hardening.md`](../plan-money-path-hardening.md) phase table; PRs merged + fns redeployed                                                                                                                                                                                                                                                                                                                                                                    |
| G4  | Tokenless staging promotion + explicit production release ready                              | Phase 4                  | `deploy-staging.yml` and protected `deploy-production.yml` source checks pass; external gates remain open                                                                                                                                                                                                                                                                                                                                                                          |
| G5  | Passcode ringside walk passes cold (`jh3k9`/`s7m2p`)                                         | Phase 4                  | Phase 2 step 2.3                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| G6  | Show-day re-walk + offline rehearsal + venue print test pass                                 | Phase 5                  | Phase 4 evidence links                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| G7  | Real-user testing complete, no confusion-level findings                                      | Launch                   | Lane 1.7 session results filed; scorecard UX-clarity row Green                                                                                                                                                                                                                                                                                                                                                                                                                     |
| G8  | **Data durability proven** — backups verified enabled, one restore actually performed        | Phase 3 (Stripe cutover) | Phase 2 step 2.4; scorecard **Data durability** row **Green** (a confirmed-but-untested backup is Yellow, not a passed gate); [MYK9-110](https://linear.app/myk9-platform/issue/MYK9-110/establish-and-test-a-backup-disaster-recovery-posture-currently-one)                                                                                                                                                                                                                      |
| G9  | **Capacity rehearsal PASSES**, on a workload carrying **≥50 concurrent ringside sessions**   | Phase 5 (launch day)     | Phase 4 step 4.2c — all four of: ≥50 ringside sessions in the scenario, ≤5% errors, p95 ≤200 ms API, and the scenario's own `throughputMin`/`availability`. Scorecard **Performance & capacity** row **Green**; recorded-but-failing does NOT close G9; the stock `normal_load` mix (only 10 judges) does not qualify; Peak/Stress informational; [MYK9-109](https://linear.app/myk9-platform/issue/MYK9-109/assess-refresh-and-run-the-existing-load-harness-no-rehearsal-result) |

Launch = all **nine** gates green + scorecard shows **all Primary dimensions Green** (hence no Red and
no Unknown) and **no open P0/P1** in
[`docs/goals/fall-2026-launch-readiness-scorecard.md`](../goals/fall-2026-launch-readiness-scorecard.md).

> **Do not read a gate's status check as "not Red" or "not Unknown."** Every gate closes on its
> dimension being **Green**. A rehearsal that runs and _misses_ its latency, error-rate, or
> connection targets moves Performance & capacity from Unknown to **Yellow**, which is progress but
> is **not** a passed gate — same for a partially-evidenced restore. Recorded ≠ passed.

> **G8/G9 added 2026-07-26** after the gate review ([`../launch/go-live-2026-07-26.md`](../launch/go-live-2026-07-26.md) § 8)
> found that this runbook had **no data-durability and no capacity gate at all** — so "never verified
> our backups" and "never recorded a load result" could not appear in the launch decision, and a
> review run against G1–G7 came back all-green-but-not-ready. G8 blocks the Stripe cutover
> deliberately: do not start taking real money before you can demonstrate you can recover the data.

---

## Phase 0 — Preconditions (code + backlog gates; do before scheduling a launch date)

These are the open engineering items that must land before the operator sequence starts. Each is
tracked elsewhere; this list is the gate inventory, not the tracker.

- [x] **0.1 Security remediation** — DONE 2026-07-04. The three listed OpenSpec
      changes are complete and archived: `security-role-map-disclosure` (SA-006),
      `security-people-overfetch` (SA-008), and `security-passcode-throttle`
      (SA-011). Owner: Agent.
      _Verify:_ archive dirs exist under `openspec/changes/archive/2026-07-04-*`;
      OPEN-TODOS § Security Remediation marks all three done/deployed/verified.
- [x] **0.1b Deploy the 2026-07-10 security remediation** — DONE 2026-07-13. The
      `security-audit-remediation` change is merged and archived; the lifecycle-hardening
      migration is applied; and `send-email`, `send-results`, and `resend-webhook` are ACTIVE
      at the reviewed revisions. [`security-audit-2026-07-10.md`](../security-audit-2026-07-10.md)
      records SA-018–023, SA-026, and SA-027 as remediated. This row was stale after the later
      security closeout and is reconciled here; no additional deployment is required.
- [x] **0.1c Complete the 2026-07-11 go-live security remediation** — DONE 2026-07-12. PRs
      #1280/#1283–#1287/#1289/#1292/#1293 are merged. SA-021 is live-verified; `resend-webhook`,
      `validate-passcode`, `generate-premium`, and all five push-trigger functions are deployed.
      Runtime evidence covers passcode healthy/429/503 plus alert recovery, premium catalog and
      concurrent fifth/sixth plus 429/503 without Claude traffic, and five inert Vault-bearer push
      successes plus service-role rejection. Advisor findings are fixed or documented exceptions.
      Owner: Agent for repository work; shared-system/operator steps require approval.
      _Verify:_ [`security-audit-2026-07-11.md`](../security-audit-2026-07-11.md) and
      [`launch/go-live-2026-07-11.md`](../launch/go-live-2026-07-11.md) agree on every open and
      deployed row. Synchronize the OpenSpec task ledger during final closeout/archive after the
      remaining operator gates are evidenced or accepted.
      _Remaining cost gate:_ a successful `generate-premium` Edge call reaches Claude and still
      requires explicit paid-traffic approval. The limiter's allowed path is already proven by the
      live concurrent fifth-attempt result; this cost smoke is not an open security defect.
      _Migration parity:_ #1294 merged remote migrations
      `20260712180000_class_status_auto_derivation` and
      `20260712190000_class_status_reopen_guard_fix` onto `main`; the post-merge dry run reports
      `Remote database is up to date.` No migration-history repair was needed.
- [x] **0.2 Deploy the `ask-myk9show` fix** — DONE 2026-07-04. The AskQ
      cross-tenant scope-leak fix (#1089) is deployed live. Owner: Agent.
      _Do:_ `supabase functions deploy ask-myk9show --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt`
      _Verify:_ `supabase functions list` — `ask-myk9show` is `ACTIVE`, version 34,
      `updated_at` = `2026-07-04 19:44:05 UTC`.
- [x] **0.3 Verify withdrawal-policy migrations** — DONE 2026-07-04.
      `20260625200000` and `20260626000000` are already applied remotely. Owner: Agent.
      _Verify:_ `supabase db push --dry-run` reported the remote database is up to date;
      `supabase migration list` shows both migrations applied locally and remotely.
- [x] **0.4 Edge-function drift audit + repo-ahead batch deploy** — DONE 2026-07-13. Re-ran the drift check from
      [`edge-function-deploy-drift-2026-06-23.md`](edge-function-deploy-drift-2026-06-23.md)
      (download deployed bundles, diff vs repo). Deploy remaining repo-ahead functions in small
      batches with smoke checks; `send-auth-email` is highest-care (see Phase 1.2). If any
      function is **deployed-ahead** (matches no commit), STOP — recover it to source first,
      do not clobber. Owner: Agent (confirmation-gated).
      _Audit 2026-07-12:_ strict per-function bundle comparison found 26 exact matches, four
      repo-ahead HTTP-helper functions (`admin-delete-user`, `admin-generate-reset-link`,
      `send-push-notification`, `send-targeted-message`), one deployed-ahead
      `stripe-upgrade-subscription` helper that matches no Git commit, and deployed-only legacy
      `send-notification`. The legacy function had no events in the prior 30 days and was retired
      after approval; the live inventory is now 31 matched / zero deployed-only / zero repo-only.
      The fallback-extension source decision merged in [#1313](https://github.com/rbeezley/myk9-platform/pull/1313);
      `stripe-upgrade-subscription` was deployed after separate approval on 2026-07-13 and its
      downloaded `premiumPrices.ts` and `index.ts` exactly match the reviewed repository source.
      The four HTTP-helper functions were separately approved and deployed on 2026-07-13; all are
      ACTIVE, unauthenticated POSTs returned 401, and a non-owner push request returned 403.
      Full evidence and the deployed four-function command are in
      [`edge-function-drift-audit-2026-07-12.md`](edge-function-drift-audit-2026-07-12.md).
- [x] **0.5 Money-path hardening Phases 1–3** — MP-01/02 (amount integrity), MP-03
      (payment-link duplicate delivery), MP-04 (mode-scoped Stripe IDs). One PR per phase per
      [`docs/plan-money-path-hardening.md`](../plan-money-path-hardening.md). **Phase 3 is the
      hard gate for Phase 3 of this runbook** (live cutover); Phases 4–7 may land later. Owner: Agent.
      _Verify at execution time_ — do not trust this doc's snapshot; check the plan's phase table
      and merged PRs.
      _Batch evidence 2026-07-06:_ Phase 1 is merged and DB-pushed. MP-03/MP-04 source changes
      merged in PR #1170 under OpenSpec change `go-live-phase-0-engineering-blockers`; focused
      tests, typecheck, lint, OpenSpec validation, and the MP-04 verifier passed. Real DB push
      applied `20260706013906_stripe_livemode_scoped_ids.sql`, and the affected Stripe functions
      (`stripe-checkout`, `stripe-connect-onboard`, `stripe-customer-portal`, `stripe-webhook`,
      `cron-process-payouts`) redeployed as `ACTIVE` at `2026-07-06 14:21:03 UTC`.
      _Staging verification 2026-07-13:_ a controlled Stripe sandbox payment-link charge was paid
      and its same `checkout.session.completed` event manually resent; link and entry remained
      `paid`, with no refund. The authenticated E2E cart-checkout handler resolved only its
      `livemode=false` customer and rejected an empty cart before creating a Checkout session or
      charge; the empty probe cart was then abandoned.
- [x] **0.6 Class-mgmt mutation-error surfacing (plan 003)** — DONE 2026-07-04.
      OpenSpec change `class-mgmt-mutation-error-surfacing` is archived under
      `openspec/changes/archive/2026-07-04-class-mgmt-mutation-error-surfacing/`. Owner: Agent.
- [ ] **0.7 Finish remaining agent-owned launch remediation before human testing** — Do not
      schedule Phase 4 real-user sessions until these active product changes are merged or
      explicitly accepted as P2: (a) resolve the contradictory exhibitor entry state; (b) run the
      remaining focused exhibitor Playwright/low-tech verification and final dog-profile
      re-walk; (c) merge, pass CI, and archive `ux-contrast-token-system`; (d) complete the
      authenticated visual evidence plus PR/CI closeout for `improve-exhibitor-entries-scan`.
      _Completed control remediation 2026-07-14:_ PR #1264 raised the registration payment-remove
      control from 32px to `min-h-11 min-w-11` and Cart “Continue Shopping” from 40px to
      `min-h-11`; focused regression tests passed (2 files, 7 tests).
      _Completed secretary re-walk 2026-07-14:_ authenticated Setup and Show Desk checks at
      desktop, 768px tablet, and 390px mobile found and repaired a tablet header overlap. The
      shared `DetailHero` now keeps header actions in normal flow through tablet widths and uses
      absolute positioning only at desktop; focused regression tests (2 files, 17 tests) and the
      myK9Show typecheck passed.
      _Already complete:_ motion consistency and the original July UX remediation plan. The
      remaining evidence-only gates are the scorecard's show-day re-walk, offline→reconnect
      rehearsal, data reconciliation, venue print test, real-user testing, and deployment/
      rollback verification.

---

## Phase 1 — Platform & deploy pipeline (operator setup, ~1–2 h)

**Gate in:** G1 + G2 (Phase 0 items 0.1–0.4 done).

### 1.1 Activate tokenless staging and explicit production releases

Full detail: [`ci-vercel-deploys.md`](ci-vercel-deploys.md). The repository now keeps
automatic promotion and production release authorization separate.

- [ ] **a.** Configure protected `staging-release` and `guides-release` refs, Vercel
      branch tracking, and the repository variable `STAGING_RELEASE_ENABLED=true` only
      after external staging setup is verified.
- [ ] **b.** Keep `VERCEL_TOKEN` only in the protected GitHub `production` environment,
      alongside the production project identifiers. Automatic staging promotion must not
      receive it.
- [x] **c.** Source code now routes successful main CI through
      [`deploy-staging.yml`](../../.github/workflows/deploy-staging.yml), which promotes
      the exact validated SHA to the two release refs without invoking Vercel.
- [x] **d.** Source code now routes production through a manual
      [`deploy-production.yml`](../../.github/workflows/deploy-production.yml) with
      full-SHA/main-reachability/successful-CI/staging-evidence preflight before the
      protected production job can read deployment credentials.
- [x] **e.** `pnpm qa:go-live:phase1:test` verifies both workflow source contracts and
      rejects any automatic workflow reference to `VERCEL_TOKEN`.

### 1.2 Auth email cutover (Resend hook + Custom SMTP rate limit)

Full detail: [`supabase-auth-email.md`](supabase-auth-email.md). Custom SMTP was configured
2026-07-12; the former built-in-service rate cap is no longer the launch-day signup wall.

- [x] **a.** DONE 2026-07-04. Deploy-coupled hook secret: `SEND_EMAIL_HOOK_SECRET`
      matches the dashboard Send Email Hook secret. The initial verified hook release was v45;
      the bounded-retry release is now deployed as `send-auth-email` v47,
      and one real password-reset email verified the branded template path (`send-auth-email`
      200 signature-verified + `resend-webhook` 200).
      _Rollback:_ redeploy prior function version + restore prior hook secret in the same window.
- [x] **b.** DONE 2026-07-12. Raised the rate limit via Management API PATCH (NOT `supabase config push`): backed up
      `GET /v1/projects/$REF/config/auth` first, then patch `smtp_*` (Resend:
      `smtp.resend.com:465`, user `resend`, pass = the Resend API key,
      `smtp_admin_email: notifications@myk9show.com`) + `rate_limit_email_sent: 100`.
      Exact curl commands in the runbook.
      _Verify:_ rapid signups no longer hit "email rate limit exceeded"; template still branded.
      _Rollback:_ restore from the config backup JSON.
      _Audit 2026-07-05:_ still open; `supabase-auth-email.md` still documents the Custom
      SMTP slot as empty and the GoTrue cap as active until this patch is applied.
      _Audit 2026-07-06:_ `pnpm qa:go-live:phase1` verifies the runbook still documents the
      Management API PATCH path with Resend SMTP fields and `rate_limit_email_sent: 100`;
      no Management API write has been run in this batch.
      _Completion evidence 2026-07-12:_ post-PATCH Management API read-back returned
      `smtp.resend.com:465`, sender `myK9Show <notifications@myk9show.com>`, limit `100`,
      Send Email Hook enabled, and unchanged `site_url=https://myk9show.com`. A real password-reset
      request to Gmail was accepted by the deployed app, reported `delivered` by Resend, and visually
      confirmed as the branded myK9Show template. The temporary Management API token was revoked.
- [x] **c.** DONE 2026-07-12. Bounded Resend retry runtime acceptance. PR #1296 is deployed to all 12 affected
      functions across both Supabase roots; version read-back, exact prior-source rollback commands,
      a 9×401/2×403/1×400 fail-closed matrix, and one delivered post-deploy password reset are in
      [`transactional-email-reliability.md`](../../openspec/changes/go-live-2026-07-11-gate-remediation/evidence/transactional-email-reliability.md).
      A valid registration confirmation is `delivered` and visually confirmed; a live operator alert was persisted,
      verified, and resolved; and a provider-safe 16-message burst recovered six real Resend 429s
      after 1,000 ms with all logical sends ending 200 and PII-free telemetry. The temporary guarded
      harness was deleted and remote inventory is zero. The operator visually confirmed the tagged
      alert email in Gmail with the expected subject and controlled-test body.

### 1.3 Kill-switch posture check

All four show-day realtime flags stay **ON through the first live shows** (decision 2026-06-15)
as no-redeploy safety valves: `showPresence`, `showLiveSync`, `showEditAwareness`,
`showConflictSurfacing` (`apps/myk9show/src/config/features.ts`, env overrides
`VITE_SHOW_PRESENCE` etc.).

- [ ] _Verify:_ all four read `true` in the production build; the four `VITE_SHOW_*` env vars are
      either unset or `true` in Vercel.
      _Audit 2026-07-05:_ code defaults are `true` in
      `apps/myk9show/src/config/features.ts`; production Vercel env still needs dashboard proof.
      _Audit 2026-07-06:_ `pnpm qa:go-live:phase1` re-verifies all four source defaults are
      `true`; production Vercel env proof remains open.
- [ ] _Rehearse the flip once:_ set one var to `false` in Vercel env → redeploy (~5 min) → hard
      refresh → feature silently off, fallback behavior active → restore. This is the launch-day
      rollback for realtime misbehavior (see Rollback appendix).

---

## Phase 2 — Data, seeds & access verification (~1–2 h)

**Gate in:** Phase 1 complete (deploy pipeline is how fixes ship from here on).

### 2.1 Judge directory preload

Importer tooling shipped (#833); the CSV is still header-only.

- [ ] **a.** Obtain real AKC + UKC judge exports. Owner: Operator (external data acquisition).
- [ ] **b.** Populate `supabase/seed-data/akc-ukc-judges.csv`, then
      `npx tsx scripts/import-judges.ts > supabase/migrations/NNN_judge_directory_preload.sql`
      and push (idempotent `people` + `judge_qualifications`). Owner: Agent (confirmation-gated).
      _Verify:_ `select count(*) from judge_qualifications;` > 0; spot-check a known judge by name
      in the show-wizard judge picker.
      _Audit 2026-07-06:_ `pnpm qa:go-live:phase2 --allow-blocked` reports `0 judge data
rows after header`; importer tooling is present, but no preload migration should be
      generated or pushed until real AKC/UKC exports are added.

### 2.2 Seed / fixture verification (staging, and prod if demo data is wanted)

Run the post-reseed checks from [`staging-reseed.md`](staging-reseed.md):

- [ ] `select count(*) from judge_assignments;` > 0 (empty silently breaks all judge flows)
- [ ] Role grants present: secretary / club_admin / judge / steward / chairman active in `user_roles`
- [ ] Ringside passcodes seeded for the demo show (`show_passcodes`, Heartland
      `dededede-…-0010`)
- [ ] Demo show + classes present
      _Rollback/repair:_ re-run `supabase/seed-demo.sql` (idempotent; 11 protected accounts).
      _Audit 2026-07-06:_ PR #1172 merged the Phase 2 verifier tooling. Source-level verifier:
      `pnpm qa:go-live:phase2 --allow-blocked` confirms `seed-demo.sql` references the required
      Phase 2 sections and `scripts/go-live/phase-2-data-access.sql` contains the read-only
      staging/prod checklist. Live DB evidence is still open until run with `--db-url`.

### 2.3 Passcode ringside identity — live verification (G5)

Code complete (#951–#954); this is **verify, not build**. Full checklist:
[`docs/plan-ringside-entries-read-authz.md`](../archive/plan-ringside-entries-read-authz.md) Phase E.

- [ ] **a.** Supabase Dashboard → Auth → Providers → **Allow anonymous sign-ins** is ON
      (staging AND prod). Owner: Operator.
- [ ] **b.** Cold incognito session, judge passcode `jh3k9` → `/at-show/:showId`: run order
      renders, entries visible, scoring works, payment columns absent.
- [ ] **c.** Cold incognito session, steward passcode `s7m2p`: run order + check-in enabled,
      scoring rejected.
- [ ] **d.** Stale-anon cleanup live: cron `cleanup_stale_ringside_anon_users` scheduled
      (04:00 UTC daily); spot-check `cron.job`.
- [ ] Parked, non-gating: CAPTCHA hardening on the passcode form.
      _Audit 2026-07-06:_ source-level verifier finds the stale-anon cleanup migration source;
      Supabase anonymous sign-in dashboard proof, cold judge/steward incognito walks, and live
      `cron.job` evidence remain operator/live-verification gates.

### 2.4 Data durability — backups verified and one restore performed (G8)

**Added 2026-07-26.** Owner: Operator (dashboard) + Agent (procedure + partial-recovery SQL).
Tracked: [MYK9-110](https://linear.app/myk9-platform/issue/MYK9-110/establish-and-test-a-backup-disaster-recovery-posture-currently-one).

Before this existed, the runbook's only recovery guidance was one cell of the rollback appendix:
_"If data was corrupted, use PITR via Supabase support as last resort."_ That sentence is unverified —
if PITR is not enabled on the project, it is not vague, it is **false**.

- [ ] **a. Confirm the backup posture in the Supabase dashboard** for `sojmvhhwsjxmfistvzbe`:
      is PITR enabled, at what retention window, and is it a paid add-on that still needs turning on?
      Record the answer here. **If PITR is disabled, STOP** — that is a launch blocker, not a task.
- [ ] **b. Write down the accepted RPO and RTO** (how much data may be lost; how fast we can be back).
      A number the operator has agreed to, not an aspiration.
- [ ] **c. Actually perform a restore** — ideally into a scratch/branch project — and verify the
      restored data. **Record the elapsed time and compare it against the RTO agreed in step b.**
      Elapsed time is the _observed_ recovery time, not the objective — if a restore takes eight hours
      against a one-hour RTO, that is a **failed** durability gate, not a redefinition of the RTO.
      Either bring the procedure inside the objective or renegotiate the objective explicitly; do not
      let the measurement silently become the target. An untested backup is not a backup.
- [x] **d. Write the partial-recovery procedure** for the realistic incident: _one show's entries or
      scores were destroyed mid-weekend; recover those rows without rolling back every other show._
      Whole-project PITR is the wrong tool for the most likely failure.
      Written 2026-08-17 (MYK9-176) — see **§2.4.1** below. **Untested** until step **c** runs.
- [ ] **e. Replace the rollback appendix's "last resort" line** with the tested procedure.

_Why this gates Phase 3:_ after the Stripe cutover the platform holds real money and irreplaceable
show-day results — scores and placements that cannot be re-derived, because the dogs went home.

### 2.4.1 Partial recovery — one show, without rolling back the project

> **Status: UNTESTED DRAFT.** No part of this has been executed against a real restore. It is written
> from the live schema (`sojmvhhwsjxmfistvzbe`, read 2026-08-17), not from an incident. Step **c**
> above is what converts it from a draft into a procedure; until then treat every claim below as
> "believed correct", and do not let its existence check off G8.

**Use `psql` connected as `postgres`, not the Dashboard SQL Editor.** Everything below uses psql
meta-commands — `\set` for the show id and tombstone, `\copy` for the hard-delete export — and those
are client features, not SQL. The SQL Editor will reject `\set` outright, and cannot write a local CSV
at all. Connect with the pooler URL from Supabase Dashboard → Settings → Database.

> _If you only have the Dashboard_ (no local psql at 3am): paste the UUID and timestamp as literals
> everywhere this document writes `:'show_id'` and `:'tombstone'`, e.g.
> `WHERE e.show_id = 'a1b2…'`. Paths **A**, **B**, and **D** work that way. Path **C** does not —
> `\copy` has no Dashboard equivalent, so a hard delete genuinely requires psql.

Do not attempt this through the app: `restore_show`/`restore_class`/`restore_dog` are gated on
`is_platform_admin()`, which reads `auth.uid()` and is therefore false in a psql session (the RPCs
raise `42501`), and they are scoped by entity id rather than by `show_id`.

#### Step 0 — classify the incident before touching anything

The recovery path is completely different per class, and picking wrong makes things worse. Scores live
as **columns on `public.entries`** (`total_score`, `search_time_seconds`, `total_faults`,
`points_earned`, `result_status`, `is_scored`, …), not as rows in a scores table. So "the scores were
destroyed" is usually an `UPDATE`, and no delete-recovery path will help.

| Symptom                                             | Actual event                   | Go to |
| --------------------------------------------------- | ------------------------------ | ----- |
| Whole show / class / trial vanished from every list | soft delete (`deleted_at` set) | **A** |
| Some entries vanished, show and classes still fine  | soft delete, entries only      | **B** |
| Rows gone and `deleted_at` shows nothing tombstoned | hard `DELETE`                  | **C** |
| Entries present, scores blanked / wrong / reset     | overwriting `UPDATE`           | **D** |

First, define the show's entry set **once**, and use it for the rest of the procedure.
`entries.show_id` is a **nullable denormalized column** — it is not the authoritative link, and the
soft-delete RPCs cascade through `class_id`, not `show_id`. An entry whose `show_id` is null or stale
is invisible to any `WHERE show_id = …` query, so scoping on that column alone can silently leave
entries tombstoned. `class_id` and `trial_id` are nullable for the same reason, so the view unions
**all three** routes — an entry only has to reach the show by one of them:

```sql
\set show_id 'REPLACE-WITH-SHOW-UUID'

-- Canonical entry set for this show. Three independent routes, because all three
-- linking columns are nullable: the denormalized show_id, the class→trial path,
-- and the direct trial_id. The :'show_id' value is frozen into the view at
-- creation. Create it in the SAME psql session as the restore; it disappears
-- when the session ends.
CREATE TEMP VIEW show_entries AS
SELECT e.*
FROM public.entries e
LEFT JOIN public.classes c  ON c.id  = e.class_id
LEFT JOIN public.trials  ct ON ct.id = c.trial_id
LEFT JOIN public.trials  dt ON dt.id = e.trial_id
WHERE e.show_id = :'show_id'
   OR ct.show_id = :'show_id'
   OR dt.show_id = :'show_id';

-- Sanity: how many entries each path alone would have found. A gap is the number
-- of entries a naive show_id-scoped restore would have missed.
SELECT
  count(*) FILTER (WHERE show_id = :'show_id')                  AS by_show_id_only,
  count(*) FILTER (WHERE show_id IS DISTINCT FROM :'show_id')   AS reachable_only_via_class_path,
  count(*)                                                       AS total
FROM show_entries;
```

Then the triage histogram. The `deleted_at` value is the cascade fingerprint, because
`soft_delete_show` and `soft_delete_class` stamp every cascaded row with one transaction-frozen
`NOW()` — so rows sharing a timestamp were deleted by a single action:

```sql
SELECT 'entries' AS tbl, e.deleted_at, count(*)
FROM show_entries e
WHERE e.deleted_at IS NOT NULL
GROUP BY e.deleted_at
UNION ALL
SELECT 'classes', c.deleted_at, count(*)
FROM public.classes c JOIN public.trials t ON t.id = c.trial_id
WHERE t.show_id = :'show_id' AND c.deleted_at IS NOT NULL
GROUP BY c.deleted_at
UNION ALL
SELECT 'trials', t.deleted_at, count(*)
FROM public.trials t
WHERE t.show_id = :'show_id' AND t.deleted_at IS NOT NULL
GROUP BY t.deleted_at
UNION ALL
SELECT 'shows', s.deleted_at, count(*)
FROM public.shows s
WHERE s.id = :'show_id' AND s.deleted_at IS NOT NULL
GROUP BY s.deleted_at
ORDER BY 2 DESC, 1;
```

An empty result with rows genuinely missing means **hard delete** — path **C**. `deleted_at` exists on
exactly four tables (`shows`, `trials`, `classes`, `entries`); nothing else in a show is soft-deletable.

#### Step 1 — freeze, and prove the blast radius stops at this show

Tell the secretary to stop scoring on the affected rings before you write anything; a concurrent
ringside write during recovery produces a mix you cannot untangle afterwards. Then run the
**containment check** — the single most important query here, because a show weekend has other shows
live in the same project:

It must cover **all four** soft-deletable tables, not just `entries`. A wider delete can tombstone
another show's classes, trials, or the show row itself while touching none of its entries — an
entries-only check returns zero rows and waves that through:

```sql
\set tombstone '2026-08-17 14:22:31.118273+00'   -- exact value from Step 0

-- Must return ZERO rows. Any row means the delete was wider than one show, and a
-- per-show restore would leave a partially-restored database. Escalate to full PITR.
SELECT 'entries' AS tbl, COALESCE(e.show_id::text, '(null show_id)') AS other_show, count(*)
FROM public.entries e
WHERE e.deleted_at = :'tombstone'
  AND e.id NOT IN (SELECT id FROM show_entries)
GROUP BY 2
UNION ALL
SELECT 'classes', t.show_id::text, count(*)
FROM public.classes c JOIN public.trials t ON t.id = c.trial_id
WHERE c.deleted_at = :'tombstone' AND t.show_id <> :'show_id'
GROUP BY 2
UNION ALL
SELECT 'trials', t.show_id::text, count(*)
FROM public.trials t
WHERE t.deleted_at = :'tombstone' AND t.show_id <> :'show_id'
GROUP BY 2
UNION ALL
SELECT 'shows', s.id::text, count(*)
FROM public.shows s
WHERE s.deleted_at = :'tombstone' AND s.id <> :'show_id'
GROUP BY 2;
```

The `entries` arm deliberately excludes by **membership in `show_entries`** rather than by
`show_id <> :'show_id'`, so an entry with a null `show_id` shows up as out-of-scope instead of being
silently skipped by the `<>` comparison (`NULL <> 'uuid'` is `NULL`, not `true` — it would never
match).

#### Path A / B — soft delete (the recoverable case)

Run all four statements in **one transaction**, scope every statement by `show_id` **and** the exact
tombstone, and stamp `updated_at = now()` on every row. Order between them does not matter — these are
`UPDATE`s clearing `deleted_at`, so no foreign key is being satisfied or violated; the single
transaction is what matters, so a partial restore can never be observed. (Parent-before-child ordering
_is_ required in path **C**, where rows are re-inserted.) The `updated_at` stamp is not cosmetic: incremental
replication pulls rows by a server-`updated_at` watermark, so a row restored with its historical
timestamp is invisible to every ringside device that already synced past it.

```sql
BEGIN;

UPDATE public.trials
SET deleted_at = NULL, deleted_by = NULL, updated_at = now()
WHERE show_id = :'show_id' AND deleted_at = :'tombstone';

UPDATE public.classes
SET deleted_at = NULL, deleted_by = NULL, updated_at = now()
WHERE trial_id IN (SELECT id FROM public.trials WHERE show_id = :'show_id')
  AND deleted_at = :'tombstone';

-- Scoped through show_entries, NOT `show_id = :'show_id'` — an entry whose
-- denormalized show_id is null or stale is still this show's entry.
UPDATE public.entries
SET deleted_at = NULL, deleted_by = NULL, updated_at = now()
WHERE id IN (SELECT id FROM show_entries) AND deleted_at = :'tombstone';

UPDATE public.shows
SET deleted_at = NULL, deleted_by = NULL, updated_at = now()
WHERE id = :'show_id' AND deleted_at = :'tombstone';

-- Inspect the row counts, then COMMIT (or ROLLBACK if any count surprises you).
COMMIT;
```

These four statements are safe as `postgres` — they touch only `deleted_at` / `deleted_by` /
`updated_at`, so the payment and refund guard triggers (which fire on their own columns) never engage.
Path **C** re-inserts whole rows and is not safe as `postgres`; see the role note there.

For **path B** (entries only), run just the `entries` statement. If the entries were deleted
individually rather than by a cascade they will each carry a _different_ `deleted_at`; swap
`deleted_at = :'tombstone'` for a bounded window — never `deleted_at IS NOT NULL`, which would also
resurrect entries deliberately deleted weeks earlier:

```sql
-- Define the window first — these two are NOT set anywhere earlier. Read the
-- bounds off the Step 0 histogram: start just before the earliest tombstone you
-- mean to undo, end just after the latest.
\set incident_start '2026-08-17 14:00:00+00'
\set incident_end   '2026-08-17 15:00:00+00'

-- Always dry-run the window first. If this count exceeds what the secretary
-- reports missing, the window is too wide — narrow it before the UPDATE.
SELECT count(*), min(deleted_at), max(deleted_at)
FROM show_entries
WHERE deleted_at BETWEEN :'incident_start' AND :'incident_end';

UPDATE public.entries
SET deleted_at = NULL, deleted_by = NULL, updated_at = now()
WHERE id IN (SELECT id FROM show_entries)
  AND deleted_at BETWEEN :'incident_start' AND :'incident_end';
```

_Expect this to be slow._ Every restored entry fires `entries_refresh_class_scoring_state`, which
recomputes its whole class's status and placements once per row. A 500-entry show does 500 recomputes
inside the transaction. That is correct, not stuck — the final state is right; only the intermediate
work is wasted.

#### Path C — hard delete (not recoverable inside the database)

There is no in-database undo. `entries → shows` is `ON DELETE CASCADE` all the way up
(`entries_show_id_fkey`, `classes_trial_id_fkey`, `trials_show_id_fkey`), so a `DELETE FROM shows`
takes the entries, armbands, judge assignments, passcodes, messages, and payouts with it. The only
source is PITR restored into a **scratch project** — which is why step **a** is a blocker, not a task.

**The cascade is far wider than the four core tables, and it is transitive.** Forty-seven dependent
tables come away with a show. Restoring only the core four gives you a show with no ringside
passcodes, no judge assignments, no armbands, and no messages — technically recovered, operationally
unrunnable. Enumerate the real list **from the catalog at recovery time** rather than trusting any
list written here, which will go stale.

The traversal must be **recursive**: a one-level query that only looks at foreign keys pointing
directly at the four core tables misses grandchildren like `announcement_reads` (via `announcements`)
and `entry_cart_items` (via `entry_carts`), which the cascade still deletes. The chain runs four
levels deep — `waitlist_notification_events` sits at depth 4 — and the one-level query undercounted
by six tables when this was written.

```sql
-- Full transitive cascade closure from a show. 48 tables as of 2026-08-17,
-- i.e. shows itself plus 47 dependents.
WITH RECURSIVE closure AS (
  SELECT 'public.shows'::regclass AS oid, 0 AS depth
  UNION
  SELECT con.conrelid, cl.depth + 1
  FROM pg_constraint con
  JOIN closure cl ON con.confrelid = cl.oid
  WHERE con.contype = 'f'
    AND pg_get_constraintdef(con.oid) LIKE '%ON DELETE CASCADE%'
)
SELECT DISTINCT c.relname AS table_name, min(cl.depth) AS depth
FROM closure cl
JOIN pg_class c ON c.oid = cl.oid
GROUP BY c.relname
ORDER BY 2, 1;
```

Triage that list into three buckets before exporting: **must restore to run the show**
(`armbands`, `judge_assignments`, `show_passcodes`, `show_message_threads`, `show_messages`,
`volunteers`, `volunteer_*_assignments`), **must restore for money**
(`show_payouts`, `show_money_locks`, `stripe_orders`, `entry_payment_links`, `promo_codes` — and see
the money caveat in the exclusions below), and **can be regenerated or dropped**
(`premium_generations`, `paperwork_prints`, `calendar_feed_tokens`, `dog_favorites`,
`show_lifecycle_email_*`).

**Do not assume a `show_id` column identifies the rows.** Check each table's own columns first.
`promo_codes`, for one, has both `show_id` and `trial_id` and both are nullable — a trial-scoped code
has a NULL `show_id`, so `WHERE show_id = :'show_id'` silently drops it. Filter on every route the
table actually offers:

```sql
-- Pattern for a dependent table with more than one route to the show.
\copy (SELECT p.* FROM public.promo_codes p \
       LEFT JOIN public.trials t ON t.id = p.trial_id \
       WHERE p.show_id = :'show_id' OR t.show_id = :'show_id') TO 'r_promo_codes.csv' CSV HEADER
```

Grandchildren (depth ≥ 2) usually have no show link at all and must be scoped through their parent —
e.g. `entry_cart_items` via `entry_carts.show_id`.

**Export the four core levels first.** The entries cannot be inserted until their `show`, `trials`,
and `classes` rows exist again — the FKs reject them otherwise, and discovering that after you have
already loaded the CSV wastes the part of the outage you can least afford.

```sql
-- On the SCRATCH (PITR-restored) project. Run all four; keep the file names.
\set show_id 'REPLACE-WITH-SHOW-UUID'

\copy (SELECT * FROM public.shows WHERE id = :'show_id') TO 'r_shows.csv' CSV HEADER

\copy (SELECT * FROM public.trials WHERE show_id = :'show_id') TO 'r_trials.csv' CSV HEADER

\copy (SELECT c.* FROM public.classes c JOIN public.trials t ON t.id = c.trial_id \
       WHERE t.show_id = :'show_id') TO 'r_classes.csv' CSV HEADER

\copy (SELECT e.* FROM public.entries e \
       LEFT JOIN public.classes c  ON c.id  = e.class_id \
       LEFT JOIN public.trials  ct ON ct.id = c.trial_id \
       LEFT JOIN public.trials  dt ON dt.id = e.trial_id \
       WHERE e.show_id = :'show_id' OR ct.show_id = :'show_id' \
          OR dt.show_id = :'show_id') TO 'r_entries.csv' CSV HEADER
```

The entries export repeats the three-route `show_entries` union rather than filtering on `show_id`
alone, for the same nullable-column reason as Step 0.

**Re-insert as `service_role`, not as `postgres`.** Three BEFORE INSERT guards on `entries`
(`entries_protect_payment_fields_insert`, `restrict_entry_refund_columns`,
`restrict_entry_refund_decision_columns`) reject writes to `stripe_payment_intent_id`,
`payment_status`, and the refund columns. Two of the three check `current_setting('role')` and exempt
**only** `service_role` — being superuser does not help, so a plain psql re-insert dies `42501` on the
first paid entry.

**Check for schema drift before loading — this is a silent-corruption risk, not just a failure.**
The PITR snapshot is from the past; live has had migrations since. `\copy … CSV HEADER` on import
**skips** the header line, it does not match columns by name, so the load is purely positional. If a
migration added a column in the middle of the table, every value after it shifts one place to the
left and lands in the wrong column — and the insert may well succeed. Compare the two schemas first,
on **each** project:

```sql
-- Run on the SCRATCH project AND on LIVE; the outputs must be identical.
SELECT table_name, string_agg(column_name, ',' ORDER BY ordinal_position)
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('shows', 'trials', 'classes', 'entries')
GROUP BY table_name ORDER BY 1;
```

If they differ, do **not** use `SELECT *`. Re-export naming the intersection of the two column lists
explicitly, and load with a matching explicit column list, so the mapping is by name rather than by
position:

```sql
-- On SCRATCH: name the columns; same list, same order, on both sides.
\copy (SELECT id, show_id, class_id, /* … */ FROM public.entries WHERE …) TO 'r_entries.csv' CSV HEADER

-- On LIVE:
\copy r_entries (id, show_id, class_id, /* … */) FROM 'r_entries.csv' CSV HEADER
```

Columns that exist live but not in the snapshot take their defaults; columns that existed then and
were since dropped are simply omitted. Both are correct — a positional load is not.

Load on LIVE, **parents first**, all in one transaction:

```sql
-- Stage all four before inserting anything.
CREATE TEMP TABLE r_shows   (LIKE public.shows   INCLUDING DEFAULTS);
CREATE TEMP TABLE r_trials  (LIKE public.trials  INCLUDING DEFAULTS);
CREATE TEMP TABLE r_classes (LIKE public.classes INCLUDING DEFAULTS);
CREATE TEMP TABLE r_entries (LIKE public.entries INCLUDING DEFAULTS);

-- Bare form, valid ONLY if the schema-drift check above came back identical.
-- Otherwise use the explicit column-list form shown above.
\copy r_shows   FROM 'r_shows.csv'   CSV HEADER
\copy r_trials  FROM 'r_trials.csv'  CSV HEADER
\copy r_classes FROM 'r_classes.csv' CSV HEADER
\copy r_entries FROM 'r_entries.csv' CSV HEADER

-- Guard: nothing from another show may ride along. All three must be 0.
SELECT
  (SELECT count(*) FROM r_shows  WHERE id      <> :'show_id')                       AS stray_shows,
  (SELECT count(*) FROM r_trials WHERE show_id <> :'show_id')                       AS stray_trials,
  (SELECT count(*) FROM r_classes WHERE trial_id NOT IN (SELECT id FROM r_trials))  AS stray_classes;
```

**Check the snapshot for tombstones before inserting.** A show that was soft-deleted and _then_ hard
-deleted has non-null `deleted_at` in any PITR snapshot taken between the two. `SELECT *` copies
those tombstones straight back in, and the recovery "succeeds" into a show that is still invisible to
everyone:

```sql
SELECT
  (SELECT count(*) FROM r_shows   WHERE deleted_at IS NOT NULL) AS tombstoned_shows,
  (SELECT count(*) FROM r_trials  WHERE deleted_at IS NOT NULL) AS tombstoned_trials,
  (SELECT count(*) FROM r_classes WHERE deleted_at IS NOT NULL) AS tombstoned_classes,
  (SELECT count(*) FROM r_entries WHERE deleted_at IS NOT NULL) AS tombstoned_entries;
```

If any are non-zero, decide deliberately: if the soft delete was itself part of the incident, clear
the tombstones in staging (below) before inserting; if it was a legitimate earlier deletion, leave
them and do not resurrect that data. Do not skip the question.

```sql
BEGIN;
SET LOCAL ROLE service_role;   -- required; postgres is NOT exempt from the payment guards

-- Only if you decided above that the soft delete was part of the incident.
UPDATE r_shows   SET deleted_at = NULL, deleted_by = NULL;
UPDATE r_trials  SET deleted_at = NULL, deleted_by = NULL;
UPDATE r_classes SET deleted_at = NULL, deleted_by = NULL;
UPDATE r_entries SET deleted_at = NULL, deleted_by = NULL;

INSERT INTO public.shows SELECT * FROM r_shows r
WHERE NOT EXISTS (SELECT 1 FROM public.shows x WHERE x.id = r.id);

INSERT INTO public.trials SELECT * FROM r_trials r
WHERE NOT EXISTS (SELECT 1 FROM public.trials x WHERE x.id = r.id);

INSERT INTO public.classes SELECT * FROM r_classes r
WHERE NOT EXISTS (SELECT 1 FROM public.classes x WHERE x.id = r.id);

INSERT INTO public.entries SELECT * FROM r_entries r
WHERE NOT EXISTS (SELECT 1 FROM public.entries x WHERE x.id = r.id);

-- Re-stamp all four so offline clients past the old watermark actually pull them.
-- This also clears any tombstone on rows that SURVIVED the hard delete — the
-- inserts above skip those by id, so they would otherwise stay hidden.
UPDATE public.shows   SET updated_at = now(), deleted_at = NULL, deleted_by = NULL
WHERE id IN (SELECT id FROM r_shows);
UPDATE public.trials  SET updated_at = now(), deleted_at = NULL, deleted_by = NULL
WHERE id IN (SELECT id FROM r_trials);
UPDATE public.classes SET updated_at = now(), deleted_at = NULL, deleted_by = NULL
WHERE id IN (SELECT id FROM r_classes);
UPDATE public.entries SET updated_at = now(), deleted_at = NULL, deleted_by = NULL
WHERE id IN (SELECT id FROM r_entries);

COMMIT;   -- ROLE reverts with the transaction
```

(If you decided the tombstones were legitimate, drop the four staging `UPDATE`s **and** the
`deleted_at = NULL, deleted_by = NULL` clauses from the re-stamp statements.)

`INSERT … WHERE NOT EXISTS` rather than `ON CONFLICT DO NOTHING` is deliberate: it makes a
partially-surviving show (some rows deleted, some not) restore the gap without silently swallowing a
genuine primary-key collision from an unrelated cause.

**What survives a hard delete of an entry** — one thing, and it is worth knowing at 7am: `armbands`
is `ON DELETE SET NULL` on `entry_id`, so the armband row survives with its `show_id`, `trial_id`,
`armband_number`, `dog_id`, and `assigned_at` intact. That is enough to rebuild _which dog had which
armband_, i.e. the roster, though not the scores. It does **not** survive a hard delete of the show
(`armbands_show_id_fkey` cascades).

#### Path D — overwritten scores

Nothing was deleted, so no delete-recovery path applies and no `deleted_at` query will show anything.
Sources, in order of preference:

1. **The ringside device's own queue.** If the scores never reached the server, they are still on the
   tablet: IndexedDB `pending_mutations` / `failed_mutations`, plus the `replication_mutation_backup`
   localStorage key. Reconnecting that device and letting it drain is the recovery. **Do this before
   any server-side write** — a manual restore bumps `entries.version`, and the queued mutations carry
   the old version as an OCC precondition, so they will all reject as conflicts afterwards.
2. **PITR into a scratch project**, then a column-scoped diff back. Same mechanics as path C but an
   `UPDATE … FROM` of the scoring columns only, never `SELECT *`, so you do not also roll back
   payment or check-in state that legitimately changed since.
3. **Ask the judge for the paper sheets.** Not a joke and not a last resort — for a single class this
   is faster and more trustworthy than anything above.

#### Step 2 — re-derive placements (never restore them)

`final_placement` is server-authoritative and fully derived from the scoring columns, so recovery
**re-derives** it; you never restore the value. Run this only once, after every restore or re-insert
has committed:

```sql
SELECT public.recalculate_class_placements(
  ARRAY(
    SELECT c.id FROM public.classes c
    JOIN public.trials t ON t.id = c.trial_id
    WHERE t.show_id = :'show_id' AND c.deleted_at IS NULL
  ),
  COALESCE((SELECT is_nationals FROM public.shows WHERE id = :'show_id'), false)
);
```

Two traps. First, ranking only covers entries that are `is_scored = true` **and**
`result_status = 'qualified'`; everything else is left `NULL` by design, so a class of non-qualifying
runs correctly shows no placements — that is not a failed recovery. Second,
`recalculate_class_placements` does **not** filter `deleted_at`, so a still-tombstoned scored entry
takes a placement slot. Finish all restores first; never run it mid-way.

#### Step 3 — verify, from the exhibitor's side

Count live entries and per-class state from the **entries themselves**. Do not read
`classes.total_entries_count` — it is a denormalized snapshot that nothing currently maintains
(verified 2026-08-17: it reads `0` for classes holding 63–66 real entries). Trusting it here would
report an empty show after a _successful_ recovery and send you into a second, unnecessary
intervention:

```sql
SELECT count(*) FROM show_entries WHERE deleted_at IS NULL;   -- vs the secretary's expected total

SELECT c.id, c.name, c.status, c.is_scoring_finalized,
       count(e.id) FILTER (WHERE e.deleted_at IS NULL)                        AS live_entries,
       count(e.id) FILTER (WHERE e.deleted_at IS NULL AND e.is_scored)        AS scored,
       count(e.id) FILTER (WHERE e.deleted_at IS NULL
                             AND e.final_placement IS NOT NULL)               AS placed
FROM public.classes c
JOIN public.trials t ON t.id = c.trial_id
LEFT JOIN public.entries e ON e.class_id = c.id
WHERE t.show_id = :'show_id' AND c.deleted_at IS NULL
GROUP BY c.id, c.name, c.status, c.is_scoring_finalized
ORDER BY c.name;
```

Statuses should be re-derived, not stuck at `upcoming`.

- Placements present and contiguous (1, 2, 3 …) in each completed class.
- **Load the public results page in a cold incognito session.** The nulling view and column allowlist
  mean anon sees a different shape than psql does; a restore that looks right to `postgres` can still
  be invisible to an exhibitor.
- Confirm a ringside device pulls the restored rows — this is what proves the `updated_at` re-stamp
  worked, and it is the check most likely to catch a silent failure.

#### Sources that look like audit trails but are not

Verified against live 2026-08-17. Do not plan a recovery around these:

| Table                  | Reality                                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `activity_log`         | Insert paths exist in code, **0 rows** live. Also `ON DELETE CASCADE` on trial.                                       |
| `offline_scoring`      | **0 rows** live. Not a durable score archive.                                                                         |
| `result_submissions`   | **0 rows** live; only ever populated after a registry submission.                                                     |
| `entry_status_history` | Real trigger writer, but records `entry_status` only — **no scores** — and cascades away with the entry it documents. |

#### Failure modes this procedure does NOT cover

State these plainly so it is never mistaken for full DR:

- **Hard deletes without PITR.** Paths C and D-2 both assume a working PITR restore into a scratch
  project. If step **a** finds PITR disabled, the honest answer is that a hard-deleted show is gone.
- **Full fidelity of a hard-deleted show.** Path C gives explicit SQL for the four core tables only.
  Forty-seven more cascade away with the show, and the procedure hands you a catalog query plus a
  triage rule for those rather than ready-made statements — so a path C recovery is a guided
  reconstruction, not a one-command restore. Budget for it accordingly, and expect the RTO measured
  in step **c** to understate a real path C.
- **No pre-show snapshot exists.** There is no dump or export tooling in this repo. The nearest thing,
  `get_entries_for_export(show_id)`, returns roster fields only — dog, handler, armband, fee, status —
  and **no scoring columns at all**. It is a useful pre-show roster insurance policy; it is not a
  backup.
- **Multi-show and project-wide incidents.** If the Step 1 containment check returns rows, stop and
  use whole-project PITR. This procedure is single-show by construction.
- **Money.** Nothing here reconciles Stripe. Restoring an entry row does not restore a
  `payment_intent`, a refund, or a payout, and re-inserting entries can desynchronise
  `show_payouts` — treat money reconciliation as a separate, manual step.
- **Storage objects.** Logos, premium PDFs, and signature images live in Supabase Storage, which
  database PITR does not cover.
- **Auth users.** A deleted exhibitor account is not recoverable through any statement here.
- **Anything at all until step c runs.** An untested procedure is a draft.

---

## Phase 3 — Stripe live-mode cutover (~30 min + Connect-review buffer of a few days)

**Gate in: G3 + G8.**

- **G3** — money-path Phase 3 (MP-04 mode-scoping) merged AND the Stripe functions redeployed
  (`--workdir apps/myk9show`).
- **G8** — data durability proven: step **2.4** complete, meaning PITR confirmed enabled, an actual
  restore performed within the agreed RTO, and the partial-recovery procedure written. **Added
  2026-07-26.** Not "PITR is probably on" — the scorecard **Data durability** row must be Green.

Full detail: [`stripe-platform-setup.md`](stripe-platform-setup.md) Task 6.3. Owner: Operator except
where noted. Do this only when ready to take real money — there is no half-live state.

> **Why G8 gates this phase and not a later one.** After this phase the platform holds real charges,
> payouts, and refunds, and show-day results become irreplaceable — the dogs ran and went home. Taking
> money you cannot recover the records of is the one ordering mistake in this runbook that cannot be
> undone by a rollback. If step 2.4 is unchecked, **stop here**, regardless of G3.

_Agent-owned prerequisite complete 2026-07-13:_ `stripe-golive-enforcement` shipped shared
capacity enforcement, durable waitlist notifications, owner-authorized offer payment/decline, and
sandbox reconciliation evidence. Its archive is an implementation record only; it does not check
off any live-mode operator steps below.

_Audit 2026-07-06:_ PR #1174 merged the Phase 3 Stripe cutover preflight tooling. After PR #1170
merged, `pnpm qa:go-live:phase3 --allow-blocked` passes all source preflight checks, including
`mp04_mode_scoping_source_gate`. Keep every Phase 3 item unchecked until the MP-04 migration is
pushed, affected Stripe functions are redeployed, and the live-money/operator evidence below is
recorded.

- [ ] **3.1** Toggle Stripe Dashboard to **Live mode**; enable **Connect** in live mode (may
      require Stripe review — start this days ahead).
- [ ] **3.2** Create the two live webhook endpoints at
      `https://sojmvhhwsjxmfistvzbe.supabase.co/functions/v1/stripe-webhook`:
      account-scoped (`checkout.session.completed`, `customer.subscription.*`, `invoice.*`,
      `charge.refunded`) and connected-accounts-scoped (`account.updated`,
      `account.application.deauthorized`). Each has its own `whsec_…` secret.
- [ ] **3.3** Rotate edge-fn secrets: `supabase secrets set STRIPE_SECRET_KEY=sk_live_…` and
      `STRIPE_WEBHOOK_SECRET=whsec_<live account-scoped>`.
      _Rollback:_ rotate both back to the `sk_test_`/test `whsec_` values.
- [ ] **3.4** **Purge sandbox-scoped Stripe IDs** (the 2026-06-10 "No such customer" failure in
      reverse; interim gate until MP-04 code makes it structural):
      `delete from stripe_customers where livemode = false; update exhibitor_profiles set stripe_customer_id = null where stripe_customer_id is not null and not exists (select 1 from stripe_customers where stripe_customers.stripe_customer_id = exhibitor_profiles.stripe_customer_id and stripe_customers.livemode = true); delete from club_stripe_accounts where livemode = false;`
      _Verify:_ sandbox-scoped counts = 0; any `livemode = true` rows remain.
- [ ] **3.5** Branding: rename the Stripe account display name "Myk9t" → **myK9Show**
      (Settings → Connect → Branding: name, icon, brand color).
- [ ] **3.6** **Set the live platform payout schedule to Manual** (Balances → Manage payouts).
      Non-negotiable: the default daily auto-sweep drains available balance and every club
      transfer fails `insufficient_balance`.
- [ ] **3.7** Payout cron Vault secrets (live values): `edge_function_base_url`,
      `service_role_key`, `payout_cron_secret` — the last must **byte-match** the edge-fn
      `PAYOUT_CRON_SECRET` or the cron fails silently with 403 while `pg_cron` reports success.
- [ ] **3.8** Smoke the cron:
      `curl -X POST …/functions/v1/cron-process-payouts -H "x-function-secret: <PAYOUT_CRON_SECRET>" -d '{}'`
      → HTTP 200, `{"eligible_shows":N,"failed":0,…}` (N=0 is fine).
- [ ] **3.9** Real low-value entry payment + refund smoke test through the app; confirm charge +
      refund in the dashboard and entry status flips in the app.
- [ ] **3.10** Grant founding members. `people.early_adopter_until` was dropped
      (migration `20260725200000`) — that `update` now fails with `42703`.
      Entitlement lives in `subscription_entitlement_grants`, which also records
      who granted it and why.

      Preferred: the admin UI — **/people/:id → Edit → Complimentary Premium**.

                                          By SQL, the RPC is site-admin-only, and the dashboard's `postgres` role is
                                          NOT a site admin, so impersonate one:

                                          ```sql
                                          BEGIN;
                                          SET LOCAL ROLE authenticated;
                                          SELECT set_config('request.jwt.claims',
                                            json_build_object('sub','<site-admin auth_user_id>','role','authenticated')::text, true);

                                          SELECT public.admin_grant_entitlement(
                                            (SELECT id FROM public.people WHERE email = 'person@example.com'),
                                            'founding', now(), now() + interval '12 months',
                                            'Founding member — go-live batch', false);
                                          COMMIT;
                                          ```

                                          Verify with the queries in [`../entitlement-operations.md`](../entitlement-operations.md).
                                          Note `has_effective_premium_access()` is caller-scoped: querying it as
                                          `postgres` returns nothing, which is correct rather than a failure.

- [ ] **3.11** Concierge-onboard the first 3–4 club treasurers by phone using
      [`stripe-treasurer-guide.md`](stripe-treasurer-guide.md); confirm Express accounts appear
      under Connected accounts.

**Ongoing from cutover:** nightly cron health
(`select status, return_message from cron.job_run_details … jobname='nightly-show-payouts' … limit 5;`
— all "succeeded", no `Missing Vault secret`/403), Stripe failure-alert inbox, weekly float
spot-check (keep a few hundred dollars available for same-week refunds).

---

## Phase 4 — Final verification gates (the evidence pass)

**Gate in:** Phases 1–3 done; all launch-affecting code merged (users must test a near-final
product).

- [ ] **4.0 Pre-evidence code freeze** — confirm Phase 0.7's active launch remediation is
      merged and deployed, or each remaining item is explicitly accepted as P2. Record the
      decision before booking any real-user session; otherwise those sessions are invalidated by
      material product changes. Owner: Agent + Operator.

_Audit 2026-07-06:_ PR #1175 merged the Phase 4 evidence checklist and verifier tooling.
`pnpm qa:go-live:phase4 --allow-blocked` verifies the Phase 4
operator checklist exists at [`go-live-phase-4-evidence-checklist.md`](go-live-phase-4-evidence-checklist.md),
the runbook lists all evidence gates, the scorecard still tracks the Yellow dimensions, and
representative report tests exist. It also correctly reports missing live evidence slots for the
show-day re-walk, offline rehearsal, hardware print test, real-user testing, and scorecard
close-out; keep those items unchecked until evidence is recorded.

- [ ] **4.1 Show-day re-walk (judge/steward arc)** — full Phase A–F walk on staging against the
      seeded fixtures; confirms S1–S5 findings from the 2026-06-17 walk stay fixed
      (public `/results` deep link cold, judge dashboard assignments, passcode entry, withdrawn
      entry counts, consistent trial badges). Owner: Operator (QA) + Agent (fix anything found).
      Flips scorecard **Show-day reliability**.
- [ ] **4.2 Offline → reconnect rehearsal** — two browsers on staging: secretary checks in
      entries, judge (cold passcode session) scores offline, both reconnect, everything
      reconciles with no silent loss. Flips **Offline-first behavior**.
- [ ] **4.2b Cross-app data reconciliation** — with the same realistic staging fixture, compare
      entries, dogs, payments/refunds, scores, placements, results, and closeout totals across
      the secretary, exhibitor, ringside, and report surfaces. Record the query/output or
      screenshots and resolve every P0/P1 mismatch. Flips **Data correctness**. Owner: Agent +
      Operator (read-only verification).
- [ ] **4.2c Capacity rehearsal (G9)** — **added 2026-07-26.** Owner: Operator (QA) + Agent.
      Tracked: [MYK9-109](https://linear.app/myk9-platform/issue/MYK9-109/assess-refresh-and-run-the-existing-load-harness-no-rehearsal-result).
      A load harness **already exists** — do not build a parallel one:
      `apps/myk9show/src/test/load/` (k6, Artillery, Playwright, `DatabaseLoadTests`,
      `LoadTestFramework`, `LoadTestRunner`) plus `test:load:*` scripts in
      `apps/myk9show/package.json`. Its README already states the targets: **100+ concurrent users**,
      p95 **<200 ms** API, **<3 s** page loads, **<5%** error rate, **>100 req/s**.
      What is missing is that **no rehearsal result has ever been recorded** and the harness runs in
      no workflow — it predates the ringside/`at-show` consolidation, so expect staleness.
  - [ ] **a. Repair the harness' entry points first — the Playwright half does not currently run.**
        `test:load:playwright` and `test:load:quick` both invoke
        `playwright test src/test/load/playwright-load-tests.spec.ts`, but `playwright.config.ts:14`
        sets `testDir: './src/test/e2e'`, so Playwright reports **"No tests found"** and exits **1** without
        running a single load scenario. It fails loudly rather than faking a pass — verified by running
        it on 2026-07-26 — but the effect is that this half of the harness has never been exercised at
        all. Fix by adding a load-specific
        Playwright config (e.g. `playwright.load.config.ts` with `testDir: './src/test/load'`) and
        pointing the scripts at it — the same trap applies to `playwright.ci.config.ts:63`.
        Then triage the non-Playwright halves (`test:load:database`, `test:load:framework`, the k6 and
        Artillery configs), which do not depend on `testDir`.
  - [ ] **b.** Refresh scenarios to the real show-day shape: concurrent ringside scoring, check-in,
        exhibitor reads, run-order/dogs-ahead queries.
  - [ ] **c.** Seed ~500 entries across multiple trials/classes (extend the canonical seed fixture
        set — do not fork it). Target **staging or the isolated E2E project**, never the
        production-candidate project.
  - [ ] **d.** Record: peak CPU, peak `pg_stat_activity` count vs the **60**-connection cap, p95 on
        the scoring write path, ringside `40001` serialization-failure rate, replication queue depth.
  - [ ] **d1. The gate workload MUST include >=50 concurrent ringside scoring sessions.** The
        harness' stock `normal_load` scenario does **not** exercise this: its 100 virtual users are
        70 exhibitors / 15 secretaries / **10 judges** / 3 admins / 2 anonymous
        (`LoadTestFramework.ts:477-482`), and its workflows are browse/search-heavy (`browse_shows`
        at weight 40 against `/shows/browse`). Running it unchanged would close G9 while never
        testing show-day concurrency — the exact risk this gate exists for. Either raise the ringside
        share of the refreshed Normal scenario to >=50 concurrent scoring sessions, or add a
        dedicated `show_day_load` scenario and make **that** the gate scenario. Record which was used.
  - [ ] **d2. Grade against the right scenario.** The harness defines _per-scenario_ thresholds
        (`LoadTestFramework.ts:32`): **Normal** 100 users / ≤5% errors, **Peak** 250 / ≤10%,
        **Stress** 500 / ≤25%; p95 ≤200 ms API, ≤300 ms search, ≤500 ms realtime, ≤3 s page.
        **G9 closes on the Normal scenario only** — 100 concurrent users already exceeds a realistic
        show weekend of ~50 ringside devices. Peak and Stress are informational and judged against
        their own looser numbers; they neither close nor block the gate. Beware:
        `LoadTestFramework.ts:448` hardcodes `errorRate.normal` in its report generator, so the
        harness stamps ✅/❌ against 5% for _every_ scenario — read Peak/Stress figures yourself.
  - [ ] **d3. Include throughput and availability in the pass criteria**, not just latency and error
        rate — a run can post a low p95 on completed requests while virtual users sit idle or blocked.
        Use the scenario's **own** declared values (`LOAD_TEST_SCENARIOS`): Normal `throughputMin: 50`
        req/s and `availability: 99.5`%; Peak `100` / `99.0`; Stress `25` / `95.0`. The README's
        blanket ">100 requests/second" is the **Peak** figure, not Normal's — cite the scenario, not
        the README summary. All four dimensions (concurrency, error rate, latency,
        throughput + availability) must pass for G9 to close.
  - [ ] **e.** State the ceiling — "N concurrent ringside sessions on a show of M entries" — and the
        compute tier it assumes. Confirm that tier is adequate or schedule an upgrade.
  - [ ] **f.** Decide whether the harness joins a workflow (even monthly). It rotted once precisely
        because nothing ran it.
        _Run this **after** the RLS `auth_rls_initplan` fix (MYK9-111) is pushed so the numbers
        reflect the fixed policies. Note that the separately-tracked high-scan relations
        (MYK9-114) are **not** addressed by that fix._
- [ ] **4.3 Venue hardware print test** — CheckInSheet, ScoresheetReport, ResultLabels,
      ArmbandLabelsReport on a real label printer + standard laser; capture margin/scaling/duplex
      issues. Owner: Operator (at venue). Flips **Reports and official forms**.
- [x] **4.4 Exhibitor at-show awareness walk** — exhibitor-account walk with a multiple-own-entry
      fixture: own-dog highlight, dogs-ahead pill counts down live, conflict chip on both entries
      (merged #639; live-verified 2026-07-04 on staging after
      `20260704200000_at_show_exhibitor_queue_read.sql`; co-owner admin visibility tightened by
      `20260704201000_at_show_co_owner_queue_only.sql`). Evidence:
      `/private/tmp/at-show-awareness-2026-07-04/02-class-a-before.png`,
      `/private/tmp/at-show-awareness-2026-07-04/03-class-a-countdown-live-update.png`,
      `/private/tmp/at-show-awareness-2026-07-04/04-class-a-after-live-update.png`,
      `/private/tmp/at-show-awareness-2026-07-04/05-class-b-conflict.png`.
- [ ] **4.5 Real-user testing (G7, the final gate)** — recruit 2–3 non-technical users (one
      secretary, one–two exhibitors); written tasks; watch silently; log every hesitation; fix
      each before the next user. Sole closer for the "real-user testing completed" launch
      criterion + the UX-clarity scorecard row. Owner: Operator (QA).
- [ ] **4.6 Scorecard close-out** — flip the verified rows in
      [`fall-2026-launch-readiness-scorecard.md`](../goals/fall-2026-launch-readiness-scorecard.md).
      Evidence must cover Show-day reliability, Offline-first behavior, Data correctness,
      Reports and official forms, UX clarity, Operational readiness, and the two dimensions added
      2026-07-26 — **Performance & capacity** and **Data durability**; launch requires all Primary
      dimensions Green, no Red, **no Unknown**, no open P0/P1.

---

## Phase 5 — Launch day (morning-of checklist, ~30 min)

> The recurring, machine-checkable parts of this checklist are automated into a daily job — the
> `cron-health-check` edge function + the `daily-health-check` pg_cron (change
> `admin-system-health-check-runner`, #1125) — that writes a snapshot to `system_health_snapshots`;
> the **System Health board at `/admin/health`** renders the latest run at a glance (overall status,
> per-check pills, and whether the run is stale/overdue). Open it first each morning — a green board
> covers the automated checks; a stale or missing run is itself a failure signal.
> **Automated so far:** payout-cron health (5.4), the other background crons, and a migrations proxy
> (5.2 — newest-applied version only, not full local↔remote parity). **Still manual:** 5.1, 5.3,
> 5.5–5.9. Note the runner reports a `net.http_post` cron as _dispatched_, not that its Edge Function
> returned 2xx — so 5.4/5.9 downstream failures still surface via `show_payouts.failure_reason`, not
> this board. The runner is **merged but only populates the board once deployed** (the two migrations
> pushed after the table, the `daily-health-check` cron scheduled, and `health_cron_secret` set in
> Vault + `HEALTH_CRON_SECRET` on the function); until then, and for the still-manual items, treat the
> checklist below as authoritative.

### Daily-health delivery activation and proof

The July 11 gate review proved that a successful `pg_cron` dispatch is not delivery evidence. The
repository remediation adds two independent paths: a pure-SQL
`daily-health-snapshot-watchdog` at 08:00 UTC that writes a deduplicated `operator_alerts` row when
the 07:00–08:00 `cron-health-check` snapshot window is empty, and Sentry Cron check-ins emitted by
the Edge runner. Do not treat either as live until its approval-gated steps below are evidenced.

- [x] **Database path:** **DEPLOYED 2026-07-12.** Dry run proposed only
      `20260711200000_daily_health_snapshot_watchdog.sql`; migration applied and the post-push dry
      run reports parity. `daily-health-check` is active at `0 7 * * *` and
      `daily-health-snapshot-watchdog` (jobid 12) is active at `0 8 * * *`; both run as `postgres`.
- [x] **Re-check dispatch delivery:** **RECOVERED 2026-07-12.** The unchanged Vault credential
      delivered the scheduled 07:00 UTC request and a fresh `cron-health-check` snapshot landed at
      07:00:02 with `overall_status=ok`; the archived response was HTTP 200. This disproved the
      July 11 stale-key hypothesis. The earlier transient failure is not reconstructable because the
      cron discarded the `pg_net` request ID and its response row expired. Do not rotate a working
      credential solely on that disproved hypothesis. The independent watchdog and Sentry proof
      below remain required because pg_cron success alone still proves only queueing.
- [x] **Prove the durable miss:** **SCHEDULED PATH PROVEN 2026-07-15** (approved gate 2.4
      run, executed as `postgres` — the recorded `cron.job.username` — via the session pooler). The
      watchdog body was run with its window fixed to the genuinely snapshot-less 2026-07-11 07:00–08:00
      UTC day: (1) insert produced unresolved alert `aa1b43cd-66dd-4cca-a4fd-004f66b70f01` with
      `dedupe_key = daily-health-check:2026-07-11`; (2) an identical re-run returned `INSERT 0 0`,
      proving deduplication via the partial unique index; (3) after `resolved_at` was set, a further
      insert created new row `c7e056d5-596d-4935-9335-833bf4a9a641`, proving recurrence after
      resolution. Both rows are resolved with resolution notes appended to `detail` and retained as
      durable evidence. Read-only scheduled evidence on 2026-07-15 shows jobid 12 ran at 08:00 UTC as
      `postgres` with `cron.job_run_details.status = 'succeeded'` and `return_message = 'INSERT 0 0'`.
- [x] **External path:** **PROVEN 2026-07-15.** Sentry Cron monitor `daily-health-check` is active in
      `staging` at `0 7 * * *`, timezone UTC, with a 15-minute grace period, 10-minute max runtime,
      and failure/recovery tolerance 1. Alert `Daily Health Check — missed/error/recovery` is
      connected only to this monitor and routes new, resolved, escalated, and reopened issue events
      to Richard. Monitor configuration remains in Sentry; the function does not upsert it.
- [x] **Deploy check-ins:** `cron-health-check` v5 is deployed with active Supabase-side Sentry
      configuration. The scheduled July 13–15 runs show correlated successful check-ins. After the
      controlled miss below, an approved authenticated dispatch produced successful check-in
      `fc2e49f3` at `2026-07-15 15:14:28 UTC`, automatically resolved Sentry issue `#584741741`, and
      committed a fresh `overall_status=ok` snapshot in 257 ms. A failed probe that persists a
      `fail` snapshot is still an `ok` delivery check-in; the snapshot owns health status.
- [x] **Prove independence:** **ACCEPTED 2026-07-15.** Temporarily setting only the Sentry monitor
      to every minute with a one-minute grace period produced a real missed check-in and delivered
      `JAVASCRIPT-REACT-8 — Cron failure: Daily Health Check` to Richard at 15:00 UTC. The SQL
      watchdog remained unchanged at 08:00 UTC. After the Sentry schedule was restored, the
      authenticated run above recovered the monitor and Supabase snapshot independently. Sentry's
      alert history recorded one missed trigger and did not send a separate email for the automatic
      resolution; the owner explicitly accepted the resolved issue and successful check-in as the
      provider-native recovery evidence. Focused tests separately prove that failed Sentry delivery
      does not suppress a committed snapshot.

> **Amended 2026-08-22 (PR #1750).** The evidence above was gathered when `cron-health-check`
> was invoked once a day. Since MYK9-157 (2026-08-04) the `continuous-health-check` pg_cron calls
> the same function every five minutes, and until this PR **every one of those ~288 daily
> invocations checked in to the `daily-health-check` monitor** — so with failure tolerance 1, one
> transient blip paged (2026-08-22 08:45 UTC), and an `ok` from any continuous run satisfied the
> 07:00 window. Runs now report to two monitors: `daily-health-check` for the 07:00 nightly full
> run **and** for the manual `Run now` full run (which is the only in-product way to clear a missed
> page — the "Deploy check-ins" bullet above depends on that path staying open), and
> `continuous-health-check` for the five-minute runs.
>
> **Required console step, not code:** create the `continuous-health-check` monitor in Sentry at
> `*/5 * * * *` UTC with **failure tolerance above 1** (2-3). Tolerance 1 reproduces the exact false
> page this change fixes. `cronHealthCheck.source.test.ts` forbids `monitorConfig` in the function,
> so monitor configuration is console-managed by design and cannot be asserted by CI.
>
> **The "Independent SQL path" bullet above was inert from 2026-08-04 to 2026-08-22.** The watchdog
> looked for `source = 'cron-health-check'` between 07:00 and 08:00 UTC, and continuous runs write
> that same source — 13 snapshots landed in that window every day, so the predicate could not be
> satisfied. Migration `20260822180000_health_snapshot_run_mode.sql` adds a `run_mode` discriminator
> and rescopes the watchdog to `run_mode IS DISTINCT FROM 'continuous'`. Treat the pre-2026-08-22
> evidence for that bullet as proving the alert path, not the detection predicate.

Rollback: redeploy the last-good `cron-health-check`, remove/restore the Sentry secrets as
appropriate, disable the Sentry monitor, and unschedule `daily-health-snapshot-watchdog` in a new
migration. Do not edit an applied migration in place.

- [ ] **5.1** `main` is green; the exact SHA has a READY staging deployment and accepted
      staging evidence; the protected Release Production workflow succeeds; the production
      URL serves the release SHA.
- [ ] **5.2** Migration parity: `supabase migration list` — local and remote agree;
      `supabase db push --dry-run` reports nothing pending. (Merge is not deploy — verify, don't
      assume.)
- [ ] **5.3** Edge-function parity: `supabase functions list` — every function's `updated_at` is
      at/after its last code change; no deployed-ahead drift.
- [ ] **5.4** Payout cron healthy overnight (query in Phase 3 ongoing checks).
- [ ] **5.5** Admin surfaces walk: `/admin/dashboard`, `/admin/health`, `/admin/support`,
      `/admin/users`, `/admin/payouts`, `/admin/permissions`, `/admin/deleted-items`,
      `/admin/templates`, `/admin/sync`, `/admin/role-requests`, `/admin/judges/analytics`, and
      `/admin/help` all render for the site-admin account. (`/admin/alerts` and
      `/admin/performance` were deleted; `/admin/data-lifecycle` redirects to Deleted Items.)
- [ ] **5.6** Support posture: `/admin/support` is the primary myK9Show ticket queue;
      [`admin-support-runbook.md`](admin-support-runbook.md) is at hand; the two accepted
      SQL-only gaps (impersonation, arbitrary repair) understood; Sentry + Supabase logs
      dashboards open. Fluent is not part of the myK9Show launch support path.
- [ ] **5.7** Kill-switch flip procedure re-read (Rollback appendix); Vercel env page bookmarked.
- [ ] **5.8** Auth email: one real signup succeeds end-to-end (branded template, no rate limit).
- [ ] **5.9** Money: one real entry payment succeeds; refund path confirmed once post-launch
      before the first payout run.

---

## Rollback appendix

**Decide fast, roll back small.** Preferred order: feature kill-switch → Vercel redeploy of the
prior build → migration revert → Stripe mode rotate-back. Roll back the smallest layer that
stops the bleeding.

| Failure                                                                                   | Action                                                                                                                                                                    | Time    |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Realtime show-day feature misbehaving (presence/live-sync/edit-awareness/conflict toasts) | Set the matching `VITE_SHOW_*=false` in Vercel env → redeploy → hard refresh. No code change.                                                                             | ~5 min  |
| Bad frontend build                                                                        | Vercel dashboard → Deployments → promote the previous production deployment.                                                                                              | ~2 min  |
| Release pipeline itself broken                                                            | Set `STAGING_RELEASE_ENABLED=false`; pause the protected production environment; do not restore Git auto-deploy from `main` as a bypass.                                  | ~10 min |
| Bad migration                                                                             | Never edit an applied migration. Write a new reverting migration and `supabase db push` it. If data was corrupted, use PITR via Supabase support as last resort.          | 15 min+ |
| Edge function regression                                                                  | Redeploy the prior version from the last-good commit (`git show <sha>:… > tmp` then deploy), per the drift runbook.                                                       | ~10 min |
| Stripe live cutover failing (webhooks erroring, checkout broken)                          | Rotate `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` back to test values and disable the live payment surfaces; announce a payments pause. Do NOT purge live customer rows. | ~10 min |
| Payout misfire                                                                            | Payouts are Manual-schedule + cron-gated: unset the Vault `payout_cron_secret` to hard-stop the cron, reconcile via `/admin/payouts` + `show_payouts.failure_reason`.     | ~5 min  |
| Auth email broken                                                                         | Restore the auth-config backup JSON (SMTP + rate limit) and/or redeploy prior `send-auth-email` + prior hook secret in one window.                                        | ~10 min |

**Abort criteria (call it, don't push through):** any P0 (data loss, money mis-charged,
cross-tenant read) on launch day → roll back the offending layer, close entries if needed via
show settings, communicate via show announcements, regroup. Pre-launch with no real users, a
delayed launch always beats a corrupted first impression.

---

## Source documents

| Topic                                  | Doc                                                                                                      |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| OpsX batch execution plan              | [`go-live-opsx-batches.md`](go-live-opsx-batches.md)                                                     |
| Launch sequencing (lanes)              | [`docs/plan-launch-execution-lanes.md`](../plan-launch-execution-lanes.md)                               |
| Scorecard + pass thresholds            | [`docs/goals/fall-2026-launch-readiness-scorecard.md`](../goals/fall-2026-launch-readiness-scorecard.md) |
| Money-path code fixes (MP-01…14)       | [`docs/plan-money-path-hardening.md`](../plan-money-path-hardening.md)                                   |
| Stripe operator setup + Task 6.3       | [`stripe-platform-setup.md`](stripe-platform-setup.md)                                                   |
| Treasurer onboarding (customer-facing) | [`stripe-treasurer-guide.md`](stripe-treasurer-guide.md)                                                 |
| CI-gated Vercel deploys                | [`ci-vercel-deploys.md`](ci-vercel-deploys.md)                                                           |
| Auth email / SMTP / rate limits        | [`supabase-auth-email.md`](supabase-auth-email.md)                                                       |
| Edge-function drift method             | [`edge-function-deploy-drift-2026-06-23.md`](edge-function-deploy-drift-2026-06-23.md)                   |
| Admin support actions                  | [`admin-support-runbook.md`](admin-support-runbook.md)                                                   |
| Staging seed verification              | [`staging-reseed.md`](staging-reseed.md)                                                                 |
| Passcode ringside Phase E              | [`docs/plan-ringside-entries-read-authz.md`](../archive/plan-ringside-entries-read-authz.md)             |
