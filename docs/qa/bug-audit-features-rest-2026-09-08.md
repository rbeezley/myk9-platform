# Bug audit — `features/` rest — 2026-09-08

**Rotation:** ISO week **37**, `IDX = 37 % 10 = 7` → scope 8 in the `bug-audit` skill's table, **`features/` rest**, model **Fable**.

**Baseline:** `9965adb4d` (== `origin/main` at run time). Static code review, single reviewer agent, read-only. Worktree `.worktrees/bug-audit-features-rest`, bootstrapped.

**Scope audited:** `apps/myk9show/src/features/`, excluding the show-day + registration dirs that belong to the week-2 rotation (`at-show`, `show-map`, `show-workbench`, `show-today`, `show-live-sync`, `show-presence`, `show-desk-people-roster`, `registration`, `entry-operations`, `exhibitor-entry`, `offline-readiness`, `operational-views`). 36 directories, ~90k lines.

**Outcome:** four new P2 defects — all four in `features/organization-forms/`, the official-paperwork builders — plus one recurrence of a closed dead-code sweep. Money arithmetic came up clean. No P0 or P1.

---

## Filed

| Id | Sev | Title |
| --- | --- | --- |
| [MYK9-444](https://linear.app/myk9-platform/issue/MYK9-444) | — | Parent: Bug audit features-rest 2026-09-08 — P2/P3 findings |
| [MYK9-445](https://linear.app/myk9-platform/issue/MYK9-445) | P2 | AKC Trial Secretary Report reports day-of absences and scratches as "Withdrawn after closing", under-remitting AKC recording fees |
| [MYK9-446](https://linear.app/myk9-platform/issue/MYK9-446) | P2 | AKC Judge's Certification page prints 0 for the run count — the predicate tests `check_in_status = 'present'`, a value the DB constraint forbids |
| [MYK9-447](https://linear.app/myk9-platform/issue/MYK9-447) | P2 | UKC entry form never ticks the "UKC permanent registration" box — every live registration stores the spelled-out organization name |
| [MYK9-448](https://linear.app/myk9-platform/issue/MYK9-448) | P2 | UKC Nosework Trial Report is missing from the Reports catalog on a UKC-only show — its only id is tagged `registryId: 'AKC'` |

Recorded as a **comment, not a new id** — a recurrence of an already-closed sweep:

- **MYK9-322** — dead-code sweep, features. Done via PR #1984, but the entire pipeline kanban cluster and several §4 exports were never removed; a ~858-line `pipeline/print/` cluster was never in the description at all. Comment asks for a reopen and carries the full per-symbol table. Also corrects two errors in the original description (§2 is now live and must not be deleted; `HEADLINE_GOOGLE_FONTS_HREF` was never dead).

### Filing notes

- The `p0` / `p1` / `source:claude` / `audit:bug-scope` labels named in the scheduled-task file **do not exist in this workspace** (`list_issue_labels` returns 13 labels, none of them these). Used `Claude` + `Bug`, matching the 2026-09-01 audit's convention, with severity stated in each body. Creating four new workspace labels unattended did not seem like the right call; if they are wanted, that is a one-line follow-up.
- All four behavioural findings are P2, so per the skill they became sub-issues of one parent rather than standalone issues.
- No Linear write failed.

---

## Findings, with evidence

### 1. AKC Trial Secretary Report over-excludes day-of non-runs → under-remits (MYK9-445)

`features/organization-forms/akcTrialSecretaryReportPolicy.ts:20-59, :98-102` subtracts every day-of non-run from the fee-bearing count and writes the same number into the PDF's `Withdrawn` field.

The AcroForm labels extracted from `docs/AKC-forms/SW-TSReport.pdf` (JSW001 (11/25)) read, verbatim:

> "Total # of Runs at closing (excluding non-regular classes)" − "Withdrawn runs after closing **(Judge Change or Bitch in Season only)**" = "# of Runs for which recording fees are due"

The withdrawn line is reason-qualified with two admissible reasons. Absences, desk scratches and pulls are none of them.

Reachability checked against the DB, because more than half of `EXCLUDED_RUN_STATUS_CODES` is unreachable: `'abs'`, `'no-show'`, `'no show'`, `'wd'`, `'scratch'` and `'cancelled'` are stored by no column. What *does* reach the exclusion is `entry_status IN ('withdrawn','scratched','absent')`, `check_in_status = 'pulled'`, and `result_status IN ('absent','withdrawn')`.

40 runs at closing with 3 absent, 2 scratched, 1 pulled → form prints Runs paid 34 / $153.00 where its own rule gives 40 / $180.00.

Distinct from MYK9-317 (which fixed the opposite direction) and MYK9-393 (which *preserved* this exclusion as an explicit acceptance criterion, without asking whether it was right). The behaviour is pinned by `__tests__/akcTrialSecretaryReport.test.ts:124`.

### 2. Judge's Certification page run count is structurally always zero (MYK9-446)

`features/organization-forms/akcScentWorkCertificationPage.ts:131-139`:

```ts
function totalRuns(entries) { return entries.filter(e => e.checkInStatus === 'present').length; }
```

`entries_check_in_status_check` (migration `092:16-20`) permits only `no-status, checked-in, conflict, pulled, at-gate, come-to-gate, in-ring, completed`. `ReportEntry.checkInStatus` is `check_in_status` verbatim (`lib/reports/reportUtils.ts:234`). `'present'` is unsatisfiable, so the field written at `:74` is 0 on every download. `totalWithdrawn` likewise never sees `checkInStatus === 'withdrawn'`; only its `result_status` half works, so it misses `entry_status` withdrawals/scratches and pulls.

The test fixtures (`:60,78,96`) fabricate `checkInStatus: 'present'` — the test passes on data the app cannot produce (LESSONS `source-text-tests`, same family).

One caveat carried into the issue: `akcScentWorkCertificationPageFields.ts:9-13` maps constant names to AcroForm field names that do not obviously correspond (the field labelled "total number of runs (starters/participants)" receives `entries.length`; the always-zero value goes to a field named `'total number of'`). **Which printed line each value lands on was not verified against a rendered PDF** — flagged in the issue as the first step of the fix, not asserted here.

Duplicated verbatim at `components/reports/TrialSecretaryCertification.tsx:14` (outside this scope; noted in the issue).

### 3. UKC entry form's registration-type checkbox is never ticked (MYK9-447)

`features/organization-forms/ukcNoseworkEntryForm.ts:10,:31-33` compares the raw `organization` string against `'UKC'`. `resolveDogIdentity.ts:153` passes the free-text column through verbatim; the module's own header comment (`:111-127`) documents that the column has drifted to spelled-out names and provides `normalizeOrganization()` for exactly this.

Live check against `sojmvhhwsjxmfistvzbe`:

```
AKC (American Kennel Club)                  266
ASCA (Australian Shepherd Club of America)  263
UKC (United Kennel Club)                    263
```

**Zero rows store a bare `UKC`.** This is not an edge case — the box is unticked for 100% of dogs, and `temporaryListingCheckbox` / `performanceListingCheckbox` are hard-coded `false`, so the form states no registration type at all. The reviewer rated this P3; raised to P2 on the strength of the live-data check.

Registration *selection* is unaffected — that path already normalizes (`registrationMatchesOrganization`, `:141-148`). Only the checkbox re-compares raw.

### 4. UKC Nosework Trial Report unreachable from the Reports catalog (MYK9-448)

`officialPdfReports.ts:142-143` routes to `UKC_TRIAL_REPORT_CONFIG` only under report id `trial-secretary-report`, and `lib/reports/reportRegistry.ts:338-347` tags that id `registryId: 'AKC'`. `getReportsForRegistries` (`:521-526`) drops registry-tagged reports outside scope, and `getScopedRegistryIds` (`ReportControlsBar.tsx:62-82`) returns `['UKC']` for a UKC-only show. No `ukc-nosework-trial-report` id exists in the registry (grep: 0).

The workaround is the deep link `?report=trial-secretary-report` from `ResultsSubmissionPage/submissionOptions.ts:42`, which survives the filter as `selectedReportId`. That same file's step 1 (`:44`) tells the secretary to "Open Reports and download the UKC Trial Report" — following it manually fails.

### 5. MYK9-322 incompletely applied, plus an untouched print cluster (comment on MYK9-322)

~1,390 lines still dead: the whole kanban cluster (`PipelineColumn` 54, `TrialPipelineCard` 68, `ClassPipelineCard` 278, `StatChip` 27, `OverrideList` 88, `getBlockingItemsForStage`), a `pipeline/print/` cluster of ~858 lines that was never in the original description and whose only consumer is the dead `ClassPipelineCard`, plus `selectPremiumTemplate`, `clearSupportClientErrors`, `buildMagazineConfirmationProps`, `computePipelineReorder`, `CLASS_STAGE_META`, `listPdfFormFields`, and six unused style tokens.

`git log -- .../PipelineColumn.tsx` confirms #1984 never touched the file.

---

## Dropped on verification

Nothing was dropped outright, but two reviewer claims were **corrected before filing** — worth recording, since filing them as written would have put unreachable evidence on the board:

1. **F1's failure scenario cited `resultText: 'ABS'` and `'no-show'` as live statuses.** They are in `EXCLUDED_RUN_STATUS_CODES` but no column stores them — `result_status` permits `qualified, nq, absent, excused, withdrawn` (migration 042) and `check_in_status` permits neither. The finding survives on the statuses that *are* reachable (`absent`, `scratched`, `pulled`), and the filed issue carries a reachability table rather than the reviewer's scenario. The unreachable half of the constant is itself flagged in the acceptance criteria.
2. **F1 was rated P1; filed as P2.** It does not meet the P1 bar (no golden path needs developer help) and the two prior issues on the same form and the same money — MYK9-317, MYK9-393 — are both canonical P2. Consistency beats the reviewer's instinct here.
3. **F3's claim that "starters/participants prints 0" was not verified.** The constant *named* `totalRuns` holds the always-zero value, but the constant named `totalEntries` is what writes into the AcroForm field labelled "total number of runs (starters/participants)". The always-zero value is real; which printed line shows it is not established. The issue says so.
4. **F4 was rated P3; filed as P2** after querying the live database showed it affects every row rather than a rare label variant.

## Coverage

**Read closely (logic traced):** `_shared/entryAccounting.ts`, `_shared/landing/calendarDate.ts`, `_shared/hooks/useCountdown.ts`, `_shared/dogActivity.ts`, `_shared/styled*Registry`, `_shared/EntryBlankDownloadControl.tsx`; all of `financial/` (entryAccounting, financialSummary, financialReconciliation, clubShowReconciliation, payoutSettlement, payoutSupersession, chargeVerification, useClubFinancialReconciliation, platformAttention, usePlatformFinancialOverview); `payments/` money modules (platformFeeSplit, withdrawalPolicy, useWithdrawalRefundSuggestion, useEffectiveWithdrawalPolicy, formatWithdrawalPolicy, entryBalanceSummary, entryReceiptOrder, orderRefundReconciliation, moneyPresentation, paymentStatusLabels, paymentYearFilter, useMyPayments, payoutLedger, payoutBadge, usePlatformPayoutLedger, entryCloseDeadline, entryPaymentPrompt, pullReconciliation, checkoutVerification, cartCapacitySplit, cartFulfillmentView, cartSplitCheckoutStorage, finishPaymentHref, paymentChannel, useShowRefundAll, useUpdatePlatformFee, useConnectReturn, useClubStripeAccount, PlatformFeeSplitLines, ClubFeeTransparencyNote); `entitlement/*`; **all of `organization-forms/`** (every builder and fields file; the AKC TS report and Certification page checked against the shipped PDFs' extracted AcroForm labels); `emergency-trial-packet/*` (in-scope half; the renderer lives in `supabase/functions/_shared/trialPacket/`, out of scope); `judge-supplies/*` logic; `result-card/*`; `lifecycle-emails/{schedule,batchPreparation,readModel,api}.ts`; `registries/{helpers,lookup}.ts`; `dogs/identity/resolveDogIdentity.ts`; `admin-overview/{easternDay,triageSelectors}.ts`; `admin-system-health/{healthCheckCadence,systemHealthSelectors,checkHistorySelectors}.ts`; `email-delivery-history/{readModel,api}.ts`; `calendar-subscribe/*`; `notifications/{smsPreferenceService,notificationPreferenceSync}.ts`; `messages/messageShowScope.ts` + `hooks/useMessageShowClassOptions.ts`; `support/{supportDeflection,supportContext}.ts`; `judges/qualifiedJudges.ts`; `admin-help/utils/resolveExamplePath.ts`; `premium/{publishPremium,usePublishInfo,logPremiumGeneration,useGeneratePremium,coverImageDataUrl,detectFrequentOverrides,PremiumDownloadCard,LandingPageCard}`.

**Skimmed / grep-only:** `pipeline/` (import graph only), `premium/pdf/*`, `premium/PremiumContentEditor.tsx`, the eight styled-experience dirs (mount confirmed via the registries; internals unread), `messages/pages/*`, `support/{supportTickets,useSupportHelp,supportDiagnostics}.ts` (MYK9-320/316/299/225 already cover these), `admin-help/data/pageDirectory.ts`, `admin-system-health/{healthCheckRemediationMap,operatorAlertsSelectors,healthCoverage}.ts`, `maps/*`, `location/*`, `pwa/*`, `experience/*`, `command-menu/*`, `judge-supplies/*.tsx`, `lifecycle-emails/*.tsx`.

**Skipped:** everything outside `features/`, and the twelve show-day/registration dirs owned by the week-2 rotation.

**Checked and found clean** (so the next reviewer need not repeat it):

- **Cents vs dollars.** Every `dollarsToCents` / `* 100` / `/ 100` site in `financial/` and `payments/` is consistent with its documented unit (`entries.entry_fee` and `refund_amount` are DECIMAL dollars; `stripe_orders.*` are cents). `withdrawalPolicy` flat retention is stored in cents by `WithdrawalPolicyCard.inputToStored` and subtracted in cents. The platform fee split sums exactly to `feeCents`. Payout supersession matches the RPC.
- **Registry-helper bypasses.** No raw `shows.style` reads in scope. The `trials(timezone)` embed in `useWithdrawalRefundSuggestion` and the `select('registry_id')` in `judge-supplies/useTrialRegistry` both pass through `getTrialTimezone` / `getTrialRegistry`. No new MYK9-321-class site.
- **Navigation.** Every literal target in scope resolves to a mounted route: `/fees`, `/exhibitor/entries`, `/exhibitor/payments`, `/shows`, `/at-show`, `/messages/:showId`, `/admin/health`, `/secretary/messages?showId&view=email#scheduled-emails` (the page reads all three params), `/shows/:showId/entry-management?tab=waitlist` (read by `entryManagementCockpitParams`), `/shows/:showId/submit-results`, `/secretary/pipeline/:trialId`, `/shows/:showId/show-desk`. The one unroutable target, `/scoring/classes/:id/entries`, is inside the dead `ClassPipelineCard`.
- Emergency-packet delivery retry mints a fresh `snapshotId` per attempt, so `upsert:false` cannot dead-end a retry.
- Entitlement trial boundary `scoredShowCount <= 3` agrees with `useSubscriptionGate`; the trust-window math is server-relative as documented.

**Known issues landed on and deliberately not re-reported:** MYK9-317, MYK9-323, MYK9-319, MYK9-312, MYK9-336, MYK9-423 (in progress), MYK9-315, MYK9-318, MYK9-228, MYK9-243, MYK9-321, MYK9-197, MYK9-225, MYK9-229, MYK9-230, MYK9-231, MYK9-99, MYK9-443. MYK9-428/429 were spot-checked and are genuinely fixed in `useMyPayments` / `entryReceiptOrder`.

## Not audited — gaps a later run should close

- **AKC entry-form grid field numbering.** `ENTRY_GRID_ROWS` row 6 uses field suffixes `_28/_29/_30/_26/_27` — plausibly just how the PDF generator named them, but not verified against `SW-EntryForm.pdf`.
- **UKC per-entry fee semantics for withdrawn entries.** `countUKCNoseworkEntries` counts every entry; no authoritative rule was found to cite, so no finding was made. The AKC analogue turned out to be MYK9-445 — this deserves the same treatment once the UKC form's own label is read.
- **Public landing `entryCount`** (`useLandingShowData.ts:14`, out of scope) counts every row of `view_public_entry_results` including withdrawn and not-accepted. The capacity meter may overstate; no canonical rule for that surface was found. Worth a look on the `hooks/` rotation.
- `premium/pdf/*` cover and body renderers were not read.

## Process notes

- One reviewer, `run_in_background: false`, no sub-agents. 484k subagent tokens, 104 tool calls, ~25 min — within the skill's 200-350k guidance at the upper end, consistent with this being one of the larger scopes (~90k lines across 36 dirs).
- `pnpm qa:inflight` equivalent: `gh pr list --state open` shows three open PRs (#2129 backups, #2113 and #2104 dependency bumps); none touches `src/features/`. Re-checked before writing this report.
