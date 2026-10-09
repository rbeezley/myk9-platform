# Daily commit review — 2026-10-05

source: codex. No new application defect confirmed. One newly reconciled P2 harness recurrence is tracked in the reopened canonical MYK9-731. Three prior findings have closure proof; four items remain open.

## Boundary and scope

- Previous shared cursor, read from the primary checkout: `6a928bbc059179875c3ae3192cc472b130735963`, window end `2026-10-04T10:14:51Z`.
- Reviewed range: that SHA exclusive through fetched `origin/main` **`862083399e49556300c84b7cc434c9ba2c2cb41d`**, inclusive: **42 commits, 467 changed files**. A final fetch confirmed the same head.
- Window: `2026-10-04T10:14:51Z` → `2026-10-05T10:12:50Z`. No cursor coverage gap; no 24-hour fallback. The missed show-day walk below is a separate verification gap.
- Read-only implementation review in `/private/tmp/myk9-ncr-20261005`, branch `codex/ncr-review-20261005`. Primary checkout was behind remote and contained prior uncommitted audit evidence; it was preserved.
- Reviewed payment/refund transactions and replay, privacy/RBAC readers, run queues, waitlist capacity/offers/deletion, reports/onboarding, people layout, search consolidation, demo listing rules, migrations/types, tests, guard tooling and deployment/documentation changes. Read role intent and actual schemas; later commits were considered together, particularly service-fee policy exceptions.

Counts are mutually exclusive audit statuses, relative to the previous audit: **new 1 (recurrence), unchanged 1, resolved 3, duplicate 0, rejected 0, blocked 2**. No duplicate issue was created. New recurrence means newly reconciled this run, not a newly introduced application defect.

## P0 / P1

None confirmed in this review.

## P2 / source Medium

All entries below are source: codex, owned by Richard Beezley, last reconciled October 5 at the reviewed baseline above. Historical source priorities are preserved in Linear rather than mechanically mapped to current severity.

### MYK9-731 — new recurrence: missed show-day coverage

[Canonical issue](https://linear.app/myk9-platform/issue/MYK9-731), reopened to Backlog, Medium priority. Classification: test/harness prerequisite. Original first seen September 24; recurrence first/last seen October 5. Historical fixture implementation and September 26 successful walk remain completed evidence.

The [current committed walk report](https://github.com/rbeezley/myk9-platform/blob/862083399e49556300c84b7cc434c9ba2c2cb41d/docs/audits/2026-10-05-show-day-walk-claude.md#L13-L21) says its read-only SQL found seven trials ending October 1 and zero live classes/entries; no October 5 surface was walked. It explicitly left the harness problem unfiled. Current seed section 19 remains reseed-relative (`supabase/seed-demo.sql:2451–2511`, readiness assertions `2648–2668`); the runbook requires weekly reseeding (`docs/operations/staging-reseed.md:38–42`). Expected: today's live class/entry and cross-role/offline walk. Observed: no coverage. High confidence in the documented skipped run; this audit did not independently query the current live fixture, and the zero-class cause is unknown.

Archived-inclusive workflow, fixture name, stale-fixture and reseed searches plus full MYK9-731/732 descriptions and historical closure comments identified the canonical issue. Its full new execution contract records the evidence, owner, scope, impact, next action and closure gate. Recheck current readiness, diagnose missing classes, obtain separate authorization if fixture repair is needed, and rerun the missed cross-role/offline walk with SQL readbacks and cleanup evidence. Neither a seed merge nor a reseed alone closes this recurrence. No fixture mutation was attempted.

### MYK9-834 — unchanged: deployed offline scoring proof

[Canonical issue](https://linear.app/myk9-platform/issue/MYK9-834), In Review. First seen September 26. The same-session claim fix in PR #2672 remains present (`apps/myk9show/src/hooks/useAuth.ts:175–186`, `src/features/at-show/useRehydrateRingsideGrant.ts:142–163`). Historical focused proof stands; no new source regression alleged. Remaining impact is unverified expired-token offline recovery on the judge's deployed path. Closure still requires actual refocus → expired-token offline reload → durable local score → reconnect upload, including identity/revocation controls. Latest issue evidence records no completed replacement for that gate.

### MYK9-639 — blocked: owner-deferred Stripe TEST proof

[Canonical issue](https://linear.app/myk9-platform/issue/MYK9-639), Backlog. Audit lineage NCR-2026-09-19-01/-02; original report September 17, nightly first seen September 19. Current classification is an operational verification prerequisite, P2/Medium; historical money-defect severity is not reasserted. Root-aware settlement implementation remains in `apps/myk9show/supabase/functions/stripe-webhook/paymentReconciliationLoader.ts:82` and the webhook payment-link path. Source fixes #2346/#2355/#2407 and deployed webhook evidence do not replace controlled TEST settlement/readback. Owner explicitly deferred that proof until after October 10 because that show takes no online payments. No payment activity performed.

### MYK9-991 — resolved: paused refund card

[Canonical issue](https://linear.app/myk9-platform/issue/MYK9-991), already Done; NCR-2026-10-04-01, first seen October 4. [PR #2757](https://github.com/rbeezley/myk9-platform/pull/2757), `9f0de3000`, distinguishes unknown/paused reads from verified empty data at `apps/myk9show/src/pages/admin/RefundRequestsSection.tsx:115–121`. Fresh real-component/real-hook/QueryClient lifecycle tests passed, including offline→reconnect, with transport-only stubs. Together with recorded red-to-green proof, this satisfies the issue's isolated component lifecycle closure option. High confidence; no deployed browser or real payment claim. Added the fresh proof to Linear without changing its status.

### MYK9-947 — resolved: watcher current-attempt proof

[Canonical issue](https://linear.app/myk9-platform/issue/MYK9-947), already Done; NCR-2026-10-02-05, first seen October 2. Source fix #2680 predates this range. `scripts/qa/watch-pr-checks.sh:154` selection logic and self-tests at `181–321` passed freshly: 11 known answers plus seven current-attempt fixtures in both orders.

Closure now includes the owner's October 4 real draft→ready walk on throwaway PR #2734, closed unmerged. At head `a3c5e7de0`, stale SKIPPED checks coexisted with fresh in-progress/unregistered checks; watcher waited and reported green at 16:31:14Z only after fresh CI run 37216370955 succeeded at 16:30:24Z. This is recorded operational proof, not inference from a merge. No new throwaway PR was created by this audit.

## P3 / source Low

### MYK9-981 — blocked: deployed refund-board refresh proof

[Canonical issue](https://linear.app/myk9-platform/issue/MYK9-981), In Review. Original first seen October 3; client residual first seen October 4. Owner Richard; source: codex; last reconciled October 5. [PR #2725](https://github.com/rbeezley/myk9-platform/pull/2725), `691fe6a15`, fixes the client residual: `apps/myk9show/src/features/admin-system-health/useRefundRequests.ts:73–75` invalidates refunds and alerts after resolution, matching approval at `92–93`. Fresh real-hook/cache refresh test passed. Existing applied SQL/backfill evidence is recorded in Linear; no remaining client defect confirmed.

The issue's deployed board action/readback criterion remains unrecorded here: both lists must refresh promptly after the successful action. Keep that exact proof gate open rather than marking the whole issue resolved from local tests. Added a reconciliation comment; status unchanged. High confidence in local cache fix, no deployed execution claim.

### MYK9-950 — resolved: type-drift classification

[Canonical issue](https://linear.app/myk9-platform/issue/MYK9-950), already Done; NCR-2026-10-02-07, first seen October 2. Owner Richard; source: codex; last reconciled October 5. Normalization at `scripts/qa/supabase-types-drift.sh:65–77` and generated comparison at `132` passed all **25** focused contract tests freshly.

The October 4 owner closure supplies the missing full classification: PR #2736 (`1fa91df18`, head `801753310`) commits 142 substantive lines from the previous 308-line comparison; actual CI job 111484927130 then reports zero missing/extra objects and 166 generator nullability lines. The owner explicitly accepts `Json` versus `NonNullable<Json>` generator-version output as outside this issue. This audit relies on that recorded classification/acceptance and fresh detector tests; it does not claim to have independently inspected an untruncated 166-line live export.

## Checks and limits

All completed local batches exited 0 at the reviewed head; counts are executions, not unique tests:

| Batch                                                         | Files | Tests | Evidence in isolated worktree |
| ------------------------------------------------------------- | ----: | ----: | ----------------------------- |
| Refund lifecycle/cache, search, order presets, privacy        |     9 |    77 | `.logs/focused-1.log`         |
| Payment/refund replay and amounts                             |     7 |    81 | `.logs/focused-payments.log`  |
| Reports, onboarding, people layout                            |    38 |   373 | `.logs/focused-ui.log`        |
| Queue, waitlist, capacity, finance and related matching tests |    86 |   765 | `.logs/focused-remaining.log` |
| Push hold, SQL registry, assistant/notification controls      |     6 |    78 | `.logs/root-focused.log`      |
| Type drift                                                    |     1 |    25 | `.logs/types-drift.log`       |
| Total                                                         |   147 | 1,399 | Plus watcher self-test        |

Read [main CI run 37282261874](https://github.com/rbeezley/myk9-platform/actions/runs/37282261874) and its complete job list: packages, quality, six app shards, build, SQL, coverage and Test succeeded; smoke build/E2E/A11y were skipped. These are recorded main CI results, not a new PR-merge verdict. Staging deploy was skipped, as configured; no deployment inferred.

No local behavioral SQL execution, live ACL probe, authenticated browser walk, PDF print check, deployment, payment replay or shared fixture mutation. Eleven new migrations and their behavioral registrations were inspected. SQL CI success is not proof of application to the shared database.

One attempted changed-test selection accidentally expanded to full-suite collection because of the working-directory pathspec; it was interrupted (exit 130) without a verdict. No reproducible test defect was inferred. Later bounded batches above passed. Initial dependency bootstrap failed on sandbox DNS and succeeded with scoped network permission; this was an environment limitation, not a product finding.

## Tracking and retained evidence

Linear: created **0** issues; updated **MYK9-731** (reopened recurrence, full description contract, P2/Medium, Codex label), **MYK9-981** and **MYK9-991** (fresh proof comments). No issue closed by this run. Remaining actionable work lives in Linear, not solely in this report. Previously resolved items unrelated to this run are omitted.

Primary and isolated shared cursors are stamped through `862083399e49556300c84b7cc434c9ba2c2cb41d`, window end `2026-10-05T10:12:50Z`, run by `codex-daily-commit-review`, date October 5. This report and automation memory carry the same boundary. No application edits, commits, pushes, PR creation, merges, deployments or shared database writes. Owned worktree retained for logs and uncommitted audit documents; other worktrees and primary dirty files preserved.

## Reviewed commit inventory

- `691fe6a15` fix(refunds): resolving a refund request refreshes the alert list too (MYK9-981) (#2725)
- `be53fe3c3` refactor(trials): Trial entries search onto the list toolkit; delete DataTable built-in search (MYK9-967) (#2726)
- `719029686` fix(show-map): presets pin like hand placement; delete drag reorder mode (MYK9-990) (#2722)
- `95c061756` feat(results): guest Export CSV on the public class results table (MYK9-993) (#2728)
- `1ea18895a` docs(waitlist): MYK9-971 phase 1 walk record and secretary guide card 7 corrections (#2730)
- `119dd98b4` fix(refunds): never refund the service fee; refunds are entry fees only (MYK9-966) (#2729)
- `f5bc6e8e2` feat(brand): ship approved dog-and-Q vector logo (#2732)
- `d0b6b534d` feat(listings): keep demo fixture clubs off the signed-out listings (MYK9-952) (#2733)
- `cf0f51e78` feat(results): results privacy — per-person setting, default private, plus a show-wide switch (MYK9-969) (#2731)
- `bf9089f1d` feat(run-order): show place in line, not the stored run number (MYK9-992) (#2727)
- `1fa91df18` chore(supabase): regenerate database types from the applied schema (MYK9-950) (#2736)
- `fe4da34c4` fix(payments): resolve a paid link's waitlist offers inside the settlement RPC (MYK9-968) (#2737)
- `fb2925147` fix(shows): a show must belong to a club; shows.club_id NOT NULL (MYK9-1008) (#2738)
- `775d6232a` refactor(run-order): delete the last two second run-order rules (MYK9-994) (#2739)
- `7738de178` chore(supabase): regenerate database types after MYK9-1008, 968 and 969 pushes (#2740)
- `c13a763db` fix(financial): club-funded refunds are not platform loss; order-less charges refund in full (MYK9-997) (#2741)
- `454e730d8` feat(waitlist): class entry limit + allow wait list, wait list settings on the Waitlist tab (MYK9-998, MYK9-999) (#2735)
- `b3c19e5e2` feat(payments): replayable cart fulfillment; cart overflow joins the approval queue (MYK9-964) (#2744)
- `e1fbd50f3` feat(onboarding): require the mailing address, explaining registries like AKC need it (MYK9-1010) (#2742)
- `b9e1a6164` chore(supabase): regenerate database types after MYK9-997 and MYK9-964 pushes (#2746)
- `4ccac6ed6` feat(reports): Result Catalog becomes the AKC marked catalog, initialed by the judge (MYK9-1009) (#2743)
- `309e4de15` feat(payments): cart overflow refunds an unserved line in full, service-fee share included (MYK9-964) (#2745)
- `df2b8524a` feat(waitlist): per-show automatic-offer switch, secretary notice, one offer message for both paths (MYK9-1003) (#2747)
- `56ffca579` chore(supabase): regenerate database types after the MYK9-1003 push (#2748)
- `c7451f5a3` feat(waitlist): say plainly that joining a waitlist is free (MYK9-1013) (#2749)
- `b1b5ae29c` fix(waitlist): in-app offer message names the deadline and says you pay only if you claim (MYK9-1013) (#2750)
- `69fca98c1` fix(waitlist): offer email/push deadline falls back to New York like the rest of the app (#2751)
- `cffd8b9db` docs: plan master-detail lists (list left, detail right)
- `6a6fc0d4b` chore(guides): publish the guides only on request; Vercel Git deploys off (owner decision) (#2752)
- `9f0de3000` fix(admin): refund queue card no longer reads a paused first fetch as empty (MYK9-991) (#2757)
- `b245f732f` feat(people): list left, person right on wide screens (#2756)
- `8d1f9ff6a` fix(waitlist): prune removed and withdrawn rows from the waitlist replica (MYK9-1000) (#2753)
- `48ae3c05c` chore(supabase): regenerate database types after the MYK9-1000 push (#2760)
- `ba73dbc9f` feat(run-order): exhibitor place in line from a server count (MYK9-995) (#2759)
- `722242941` feat(payments): a paid checkout that created nothing joins the refund approval queue (MYK9-963) (#2758)
- `1898afd25` chore(supabase): regenerate database types after the MYK9-995 push (#2761)
- `d5db881f2` test(registration): wait for the cart before asserting the re-entry chip is enabled (MYK9-1014) (#2762)
- `cdf2069c1` chore(supabase): regenerate database types after the MYK9-963 push (#2764)
- `697f991de` fix(hooks): push-hold finds old directives via search, not a 2000-comment window (MYK9-1015) (#2763)
- `d0ac28264` feat(waitlist): My Shows offer card states its deadline as a clock time in the trial timezone (MYK9-1002) (#2765)
- `fdc776704` fix(waitlist): capacity card says how far over the limit a judge-day is (MYK9-1006) (#2766)
- `862083399` docs(audits): show-day walk 2026-10-05 blocked, fixture stale
