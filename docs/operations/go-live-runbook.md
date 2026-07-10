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

| #   | Gate                                                                                         | Blocks                   | Status check                                                                                                    |
| --- | -------------------------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| G1  | Security remediation deployed (including 2026-07-10 SA-018…023/026/027)                       | Phase 1                  | `security-audit-remediation` merged, migration/function deployment recorded, and `OPEN-TODOS.md` updated         |
| G2  | Pending deploys/migrations reconciled (`ask-myk9show`, withdrawal migrations, edge-fn drift) | Phase 1                  | Phase 0 verification commands below                                                                             |
| G3  | Money-path hardening Phases 1–3 merged + deployed (MP-01…MP-04)                              | Phase 3 (Stripe cutover) | [`docs/plan-money-path-hardening.md`](../plan-money-path-hardening.md) phase table; PRs merged + fns redeployed |
| G4  | CI-gated production deploys active                                                           | Phase 4                  | Deploy Production workflow green on `main`; Git auto-deploy off                                                 |
| G5  | Passcode ringside walk passes cold (`jh3k9`/`s7m2p`)                                         | Phase 4                  | Phase 2 step 2.3                                                                                                |
| G6  | Show-day re-walk + offline rehearsal + venue print test pass                                 | Phase 5                  | Phase 4 evidence links                                                                                          |
| G7  | Real-user testing complete, no confusion-level findings                                      | Launch                   | Lane 1.7 session results filed; scorecard UX-clarity row Green                                                  |

Launch = all seven gates green + scorecard shows **no Red, no open P0/P1** in
[`docs/goals/fall-2026-launch-readiness-scorecard.md`](../goals/fall-2026-launch-readiness-scorecard.md).

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
- [ ] **0.1b Deploy the 2026-07-10 security remediation** — The new full audit found no
      CRITICAL/HIGH issues, but its three branded-email recipient/authorization findings are
      MEDIUM and must not ship unresolved. `security-audit-remediation` has code and focused
      tests complete; merge it, then apply its lifecycle hardening migration and deploy
      `send-email`, `send-results`, and `resend-webhook` after the required shared-system
      approval. Owner: Agent (merge/deploy confirmation-gated).
      _Verify:_ the migration is applied, all three functions are ACTIVE at the deployed
      revision, and [`security-audit-2026-07-10.md`](../security-audit-2026-07-10.md) records
      SA-018–023, SA-026, and SA-027 as remediated.
- [x] **0.2 Deploy the `ask-myk9show` fix** — DONE 2026-07-04. The AskQ
      cross-tenant scope-leak fix (#1089) is deployed live. Owner: Agent.
      _Do:_ `supabase functions deploy ask-myk9show --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt`
      _Verify:_ `supabase functions list` — `ask-myk9show` is `ACTIVE`, version 34,
      `updated_at` = `2026-07-04 19:44:05 UTC`.
- [x] **0.3 Verify withdrawal-policy migrations** — DONE 2026-07-04.
      `20260625200000` and `20260626000000` are already applied remotely. Owner: Agent.
      _Verify:_ `supabase db push --dry-run` reported the remote database is up to date;
      `supabase migration list` shows both migrations applied locally and remotely.
- [ ] **0.4 Edge-function drift audit + repo-ahead batch deploy** — re-run the drift check from
      [`edge-function-deploy-drift-2026-06-23.md`](edge-function-deploy-drift-2026-06-23.md)
      (download deployed bundles, diff vs repo). Deploy remaining repo-ahead functions in small
      batches with smoke checks; `send-auth-email` is highest-care (see Phase 1.2). If any
      function is **deployed-ahead** (matches no commit), STOP — recover it to source first,
      do not clobber. Owner: Agent (confirmation-gated).
      _Audit 2026-07-05:_ name inventory is not clean:
      `pnpm qa:db-drift:functions` reports deployed-only `send-notification` and repo-only
      `push-trigger-support-message`; byte-level download/diff still needs a fresh pass.
      _Audit 2026-07-06:_ fresh inventory still reports 29 matched, deployed-only
      `send-notification`, and repo-only `push-trigger-support-message`. Byte-level runtime diff
      downloaded to `/private/tmp/myk9-edge-functions-20260706` shows repo-ahead runtime changes for
      `ask-myk9show` and `send-email`, plus expected repo-ahead changes for MP-04 functions in the
      B0 branch (`stripe-checkout`, `stripe-connect-onboard`, `stripe-customer-portal`,
      `stripe-webhook`, `cron-process-payouts`). Keep 0.4 open until `send-notification` is
      recovered or explicitly retired and required repo-ahead deploys are approved, executed, and
      smoke-checked.
- [ ] **0.5 Money-path hardening Phases 1–3** — MP-01/02 (amount integrity), MP-03
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
      `cron-process-payouts`) redeployed as `ACTIVE` at `2026-07-06 14:21:03 UTC`. Keep this item
      open until staging payment verification is recorded.
- [x] **0.6 Class-mgmt mutation-error surfacing (plan 003)** — DONE 2026-07-04.
      OpenSpec change `class-mgmt-mutation-error-surfacing` is archived under
      `openspec/changes/archive/2026-07-04-class-mgmt-mutation-error-surfacing/`. Owner: Agent.
- [ ] **0.7 Finish remaining agent-owned launch remediation before human testing** — Do not
      schedule Phase 4 real-user sessions until these active product changes are merged or
      explicitly accepted as P2: (a) resolve the contradictory exhibitor entry state and two
      sub-44px entry/cart controls in `OPEN-TODOS.md`; (b) complete the remaining
      `exhibitor-elderly-ux-remediation` show-day, check-in-language, and dog-profile tasks;
      (c) complete `ux-contrast-token-system`; and (d) close the code/CI side of
      `improve-exhibitor-entries-scan` and `secretary-show-details-ux-remediation`.
      _Already complete:_ motion consistency and the original July UX remediation plan. The
      remaining evidence-only gates are the scorecard's show-day re-walk, offline→reconnect
      rehearsal, data reconciliation, venue print test, real-user testing, and deployment/
      rollback verification.

---

## Phase 1 — Platform & deploy pipeline (operator setup, ~1–2 h)

**Gate in:** G1 + G2 (Phase 0 items 0.1–0.4 done).

### 1.1 Activate CI-gated production deploys

Full detail: [`ci-vercel-deploys.md`](ci-vercel-deploys.md). Order matters — validate with
auto-deploy still ON before turning it off.

- [ ] **a.** Add three GitHub Actions secrets: `VERCEL_TOKEN` (Vercel account → Tokens),
      `VERCEL_ORG_ID` + `VERCEL_PROJECT_ID` (from `.vercel/project.json` after a local
      `vercel link`; read locally, never commit). Owner: Operator.
- [ ] **b.** Set repo variable `PRODUCTION_DEPLOY_ENABLED=true`.
      _Verify:_ next `main` build → **Deploy Production** workflow runs after CI green, prints
      the production URL, URL serves the expected build. (A double deploy — Git + workflow — is
      expected and harmless at this stage.)
      _Rollback:_ set the variable to `false`; the deploy job skips.
- [ ] **c.** Only after b verifies: land a commit setting `git.deploymentEnabled.main: false` in
      `apps/myk9show/vercel.json` (config-as-code; do NOT use an Ignored Build Step — it would
      abort the workflow's own deploy).
      _Verify:_ a push to `main` no longer auto-deploys; only the workflow does.
      _Rollback:_ revert that commit.
- [ ] **d.** Follow-up (non-gating): gate the `apps/docs` guides Vercel project the same way.
      _Audit 2026-07-06:_ PR #1173 merged the Phase 1 verifier tooling. `pnpm qa:go-live:phase1`
      verifies the production deploy workflow
      source is staged, CI-gated, constrained to successful `main` push CI runs, gated by
      `PRODUCTION_DEPLOY_ENABLED`, and wired to Vercel secrets. The same verifier reports
      `warn vercel_git_auto_deploy_disable` because `git.deploymentEnabled.main=false` is
      intentionally not present until one CI-gated production deploy is validated.

### 1.2 Auth email cutover (Resend hook + Custom SMTP rate limit)

Full detail: [`supabase-auth-email.md`](supabase-auth-email.md). Without Custom SMTP, GoTrue
caps auth emails at ~2/hour — a launch-day signup wall.

- [x] **a.** DONE 2026-07-04. Deploy-coupled hook secret: `SEND_EMAIL_HOOK_SECRET`
      matches the dashboard Send Email Hook secret, `send-auth-email` is deployed as v45,
      and one real password-reset email verified the branded template path (`send-auth-email`
      200 signature-verified + `resend-webhook` 200).
      _Rollback:_ redeploy prior function version + restore prior hook secret in the same window.
- [ ] **b.** Raise the rate limit via Management API PATCH (NOT `supabase config push`): back up
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
[`docs/plan-ringside-entries-read-authz.md`](../plan-ringside-entries-read-authz.md) Phase E.

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

---

## Phase 3 — Stripe live-mode cutover (~30 min + Connect-review buffer of a few days)

**Gate in: G3 — money-path Phase 3 (MP-04 mode-scoping) merged AND the Stripe functions
redeployed** (`--workdir apps/myk9show`). Full detail:
[`stripe-platform-setup.md`](stripe-platform-setup.md) Task 6.3. Owner: Operator except where
noted. Do this only when ready to take real money — there is no half-live state.

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
- [ ] **3.10** Grant founding members:
      `update people set early_adopter_until = now() + interval '12 months' where email = '…';`
      (site-admin write-guard; run in dashboard SQL editor).
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
      Reports and official forms, UX clarity, and Operational readiness; launch requires all
      Primary dimensions Green, no Red, no open P0/P1.

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

- [ ] **5.1** `main` is green; Deploy Production workflow succeeded on the launch build; the
      production URL serves it.
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
| CI-gated deploy pipeline itself broken                                                    | Set `PRODUCTION_DEPLOY_ENABLED=false`; temporarily revert `git.deploymentEnabled.main` to `true` to restore auto-deploy.                                                  | ~10 min |
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
| Passcode ringside Phase E              | [`docs/plan-ringside-entries-read-authz.md`](../plan-ringside-entries-read-authz.md)                     |
