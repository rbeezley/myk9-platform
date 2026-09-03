# Plan verification

| Requirement                                      | Coverage | Evidence                                            |
| ------------------------------------------------ | -------- | --------------------------------------------------- |
| Cron failure response, alerts, check-ins         | Covered  | Design Decisions; tasks 1.2                         |
| Retryable notification errors remain successful  | Covered  | Monitoring spec, provider-retry scenario; tasks 1.2 |
| Dead email removal with auth/recipient preserved | Covered  | Email spec; tasks 1.1                               |
| No-subscription conflict and failure handling    | Covered  | Design Decisions; tasks 1.3                         |
| Tests compiled and actually run                  | Covered  | tasks 2.1, both registries and six seeds            |
| Remote-only deployment and verification          | Covered  | Design Migration Plan; tasks 3.2                    |
| Tracking, concurrent ownership, approval         | Covered  | Proposal Impact; tasks 2.2 and 3.1–3.3              |
| Recovery and observability outages               | Covered  | Design Risks and Migration Plan                     |

Coverage: 100/100 after stress-testing. Added explicit alert-failure isolation, per-window dedupe, rollback, and live-source verification to close operational gaps. This score describes plan coverage, not completed implementation or deployment.

## Implementation verification

| Dimension    | Evidence                                                                                                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Completeness | Implementation, required CI, PR merge, remote deployment/source verification, and Linear closure complete; documentation sync/archive/publication remain pending                                   |
| Correctness  | `cronOutcome.test.ts` covers failed primary lookup, notification-only success, thrown jobs, missing/broken monitoring, alert failures, per-window keys and actual deduplicated email orchestration |
| Correctness  | `noSubscription.test.ts` checks exact unique conflict target/payload, sequential stale-row retirement and failure short-circuit                                                                    |
| Correctness  | `authz.test.ts` rejects four retired types and unknown types before recipient queries; existing supported authorization and recipient tests remain green                                           |
| Coherence    | Existing check-in and alert helpers reused; health cron's initialization extracted without behavior change; alert email dedupe is opt-in, preserving other callers                                 |

Red/green evidence: unsupported-email tests initially failed with 403 versus
expected 400; duplicate-alert test initially sent an email when none was expected.
New cron and subscription test modules initially failed to import their not-yet-created
helpers (scaffolding failures, not claims of reproduced historical bugs).

Broad Deno entrypoint check reports ten errors, all reproduced on unchanged primary
main: two waitlist client-interface errors, six webhook query/Stripe/relationship
typing errors, and two send-email client-interface errors. None are introduced here.
The scoped edge-test TypeScript project passes. No Docker/local Supabase was started.

Independent spec review found duplicate alert email delivery; fixed with opt-in
skip-on-duplicate and behavioral coverage. It also identified overly broad monitoring
wording: narrowed to MYK9-334's primary-query/recorded-errors contract, explicitly
leaving pre-existing silent secondary capacity/promotion errors outside scope.
Authorization/method gates in the cron remain before monitoring by source inspection;
no new end-to-end auth probe was run against a live cron.

## Dead-code evidence

Final local checks (2026-09-02):

- `pnpm exec vitest run supabase/functions ../../supabase/functions` from the app:
  **123 files, 1,345 tests passed**.
- Seven focused files: **57 tests passed** on each shuffled seed 11, 22, 33, 44,
  55, 66.
- `pnpm exec tsc -p apps/myk9show/tsconfig.edge-tests.json --noEmit`: passed.
- Direct `deno check --no-config --no-lock` on cronOutcome, noSubscription,
  sentryCronClient, alertAdmin, send-email/authz and the health cron: passed.
- Focused ESLint (new helpers/tests, alert helper, Vitest config): passed.
- `node --import tsx scripts/qa/code-quality-ratchet.ts`: passed. Used this
  equivalent invocation because the pnpm script's tsx IPC pipe is sandbox-blocked.
- OpenSpec strict validation, Prettier checks, `git diff --check`: passed.

Approved shipping checks: full `pnpm typecheck` passed after lifting the sandbox's
tsx IPC restriction; full `pnpm lint` passed (18 existing warnings). The full app
run completed with 18,989 passing tests and three failures: two native watcher
tests passed on an unsandboxed rerun; one source assertion referenced the deleted
dead email template. Removed its obsolete two-test group, retaining all six live
checkout/payment-link fee assertions. Those six tests plus the live webhook email
test passed (7/7). Broad CI remains the final merge gate; the full app suite was
not rerun locally after that test-only cleanup.

### Standards review

Independent reviewer found no blocking standards findings; existing authorization,
derived recipients, privacy defaults and alert defaults are preserved.

### Spec review

Independent reviewer rechecked the alert fix and narrowed contract: no actionable
findings remain within MYK9-334. Reviewer independently ran 21 focused tests and
edge typecheck. Remaining shared-system gates are not waived by these reviews.

### Deleted symbols

Exact identifier occurrences in `supabase/functions/send-email/index.ts` before
(baseline `708af5728`) and after; an `rg` scan of the entire send-email folder
confirms zero remaining occurrences. These were local definitions/calls behind
authorization that rejected their type, not live external template owners.

| Symbol                         | Before | After |
| ------------------------------ | -----: | ----: |
| generateEntryConfirmationEmail |      2 |     0 |
| generatePaymentReceiptEmail    |      2 |     0 |
| generateWelcomeEmail           |      2 |     0 |
| generateWaitlistOfferEmail     |      2 |     0 |
| EntryConfirmationData          |      3 |     0 |
| PaymentReceiptData             |      3 |     0 |
| WelcomeEmailData               |      3 |     0 |
| WaitlistOfferData              |      3 |     0 |
| formatCurrency                 |      8 |     0 |

## Remote evidence and remaining gates

Read-only Management API source download via installed CLI `functions download
--use-api --project-ref sojmvhhwsjxmfistvzbe` confirmed:

- cron-waitlist-expiration v55: #1956's operational error response and separate
  notification errors are live; new monitoring is not.
- stripe-webhook v89: unique subscription-id upsert, error checks, and stale-row
  retirement are live; new helper extraction is not.
- send-email v73: four dead templates remain live pending this follow-up.

The source snapshots are in `/private/tmp/myk9-edge-live.2z4TQs`; verification
used code content, not version timestamps alone. After approval, deploy the three
reviewed functions using `--use-api --no-verify-jwt` from their correct roots.
Download each live function into a separate temporary directory and compare source
and bundled dependencies with the reviewed worktree. Do not deploy every function
or change secrets. Health cron's behavior-preserving extraction requires no live
behavior rollout for this issue.

The user explicitly approved PR publication, merge after CI, the three remote
function deployments, and Linear close-out on 2026-09-02 (local time).
Those implementation/deployment gates are now complete. MYK9-334 is Done.

### Completed rollout — 2026-09-03 UTC (2026-09-02 local)

PR [#1982](https://github.com/rbeezley/myk9-platform/pull/1982) merged at
01:33:44 UTC as `df598effe08b1a17947dfcf6f43dc7e3cd975946`, following final
independent APPROVED review. [CI run 33702691723](https://github.com/rbeezley/myk9-platform/actions/runs/33702691723)
passed Quality Checks, all three app-test shards, SQL tests, package tests,
coverage gate, Test, Build, A11y smoke, and E2E PR Smoke. The non-required Vercel
app preview was quota-limited; no Vercel settings were changed.

Only the three approved functions were deployed to `sojmvhhwsjxmfistvzbe`, using
`--use-api --no-verify-jwt`. No migrations, secrets, Docker, or local Supabase.

| Function                 | Live version | Exact source/dependency matches |
| ------------------------ | -----------: | ------------------------------: |
| cron-waitlist-expiration |           56 |                               9 |
| stripe-webhook           |           90 |                              25 |
| send-email               |           74 |                              10 |

All three are ACTIVE with `verify_jwt=false`. Each function was downloaded into
an isolated directory using the Management API (`functions download --use-api`),
then every downloaded source/dependency file was byte-compared to reviewed
source. This is the source-verification equivalent of the unavailable
`get_edge_function` tool. No mismatches remain. The first successful email deploy
response left v73 unchanged; source verification caught this, and an isolated
retry published v74. The cause of that first no-op response was not established.

Live POST probes were blocked by the safety reviewer and did not execute because
of potential shared-system effects. No live authenticated behavior test is
claimed. The deployment acceptance gate is source verification, backed by the
behavioral tests and green CI above.

Local evidence/rollback directories:

- Before cron: `/private/tmp/myk9-334-before-cron.qcGL2f`
- Before webhook: `/private/tmp/myk9-334-before-webhook.es0wCy`
- Before email: `/private/tmp/myk9-334-before-email.VgAtm9`
- Verified cron: `/private/tmp/myk9-334-after-cron.Om1mWr`
- Verified webhook: `/private/tmp/myk9-334-after-webhook.EG6NeY`
- Verified email: `/private/tmp/myk9-334-after-email-retry.2qDnUK`

Linear completion comment `feb17b59-f6f7-4f0c-8a02-7bb72a23a837` records the PR,
merge, tests, versions, source parity, and limitations; both acceptance criteria
are checked. The implementation branch was deleted after squash-merge proof.
The separate documentation close-out branch retains this evidence pending the
spec-sync/archive choice. Primary main's unrelated `cd0ad0762` commit remains
untouched; it cannot fast-forward without reconciling that separate work.
