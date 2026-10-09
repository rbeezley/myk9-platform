# Daily commit review — 2026-10-06

source: codex. One new P2 waitlist defect filed; remaining checked-in position evidence consolidated into existing MYK9-992. Two items have focused closure proof. No P0/P1 defect confirmed. Eight items remain unresolved, including two operational proof gates.

## Boundary and scope

- Shared primary-checkout cursor: `862083399e49556300c84b7cc434c9ba2c2cb41d`, previous window end `2026-10-05T10:12:50Z`.
- Reviewed that SHA exclusive through fetched main **`f5eb851806c33a9f01cfbb001b7eaa88f1716375`**, inclusive: **28 commits, 320 changed files**. Final fetch confirmed the same head.
- Window: `2026-10-05T10:12:50Z` → `2026-10-06T20:45:49Z`. No cursor gap and no 24-hour fallback. Primary local main lagged the shared cursor; review used fetched origin/main, preserving primary's existing audit changes.
- Review worktree: `/private/tmp/myk9-ncr-20261006`, branch `codex/ncr-review-20261006`. No application code changed. Diagnostics live only under its ignored `.logs/` directory.
- Risk-focused implementation review covered checkout holds/leases and fulfillment, waitlist offers/withdrawal/notifications, capacity and server authorization, replication/mapping, Dogs master-detail and shared People behavior, show header/entry-form consolidation, scoring correction and touch controls, fixture restoration, generated schemas, SQL-test registration, CI coverage and documentation. Read role intent and actual interfaces; evaluated subsequent commits together.

Mutually exclusive audit statuses: **new 1, unchanged 5, resolved 2, duplicate 1, rejected 1, blocked 2**. “Unchanged” includes already-tracked findings encountered in this range and older proof gates; it does not assert each was present in yesterday's report. MYK9-868's remaining unscored position scope was consolidated under the active MYK9-992 sweep, not duplicated. The mail-in email/push hypothesis was rejected because delivery explicitly excludes mail-in rows.

## P0 / P1

None confirmed.

## P2

### MYK9-1035 — new: mail-in offers display a false deadline

[Linear execution contract](https://linear.app/myk9-platform/issue/MYK9-1035). Alias NCR-2026-10-06-01. Product UX/state defect, source Medium; owner unassigned (waitlist ownership gap); first/last seen October 6; current baseline above; source: codex. High confidence.

Secretary Offered rows correctly say mail-in spots stay held until payment or withdrawal, but their Pay by column still displays `offer_expires_at`. The server stamps that timestamp for mail-in rows while intentionally exempting them from expiry. `OfferedWaitlistTable.tsx:88–97` was introduced by [#2772](https://github.com/rbeezley/myk9-platform/pull/2772), `55af2aee9`. Later [#2781](https://github.com/rbeezley/myk9-platform/pull/2781), `ce626e8c8`, fixes the dialog/message, not this table.

The exhibitor query also omits `joined_via` (`useMyWaitlistEntries.ts:51–103`, `types/waitlist-types.ts:34`), so `WaitListSection.tsx:35–57,97–103` applies online deadline semantics to the same mail-in row: Claim by before the timestamp, then Checking offer and repeated expiry refresh afterward. The held spot is not proven lost; the UI gives a false deadline and an unresolved checking state.

Focused proof on current main: a real secretary page render with the existing overdue mail-in fixture fails the assertion that `Sat, Jan 3, 9:00 AM CST` must be absent. Two real exhibitor component renders of the mapped shape fail no-Claim-by/no-expiry-refresh assertions. Source tracing confirms mail-in provenance is lost in the actual query mapping; these are component/shape proofs, not a live SQL-to-browser replay. Logs: `.logs/diagnostic-proof.log`, `.logs/mail-in-card-proof.log`.

Archived-inclusive dedup searched workflow, file, mail-in deadline and expiry symptoms; read exact MYK9-1001/1002/1017/1021 and MYK9-1002 comments. Its completed deadline/message scope remains distinct; the comment-only mail-in follow-up is now tracked here. Email/push are excluded: `shouldDeliverWaitlistEvent` rejects `joinedVia === 'mail_in'`.

Next action: preserve provenance and align both existing UI surfaces with the non-expiry contract. Closure requires real-mapping mail-in/online regression renders before/after the timestamp plus an authorized browser read confirming both mail-in surfaces remain truthful. No new page, automatic expiry or refund behavior.

### MYK9-992 — unchanged, evidence added: checked-in dog has no position explanation

[Canonical issue](https://linear.app/myk9-platform/issue/MYK9-992), In Progress, Medium. Source Medium; owner Richard Beezley; first seen September 28 under MYK9-868, last seen October 6; current baseline above; source: codex. Product UX/recovery, high confidence.

`myAtShowEntryDetails.helpers.ts:150–154` returns view-class for checked-in dogs before checking `hasRunOrder`. `AtShowMyEntriesToday.tsx:117–129` only renders pending wording for wait-running-order. A real render with `checkInStatus:'checked-in', hasRunOrder:false, isScored:false, expectedStartLabel:'9:00 AM'` shows time/check-in/View class but fails the pending-position assertion. This independently reproduces the unscored case associated with the committed Oct 6 walk's null run-order observation.

The active issue already owns the sweep to canonical place-in-line rather than raw stored numbers. Added full evidence, acceptance and closure proof there; retained MYK9-868's historical time/check-in completion. No duplicate or forced raw run number. Next action: show canonical position where determinable, otherwise honest pending state for a waiting, checked-in dog. Closure requires focused null/gapped-order renders and an authorized secretary/judge/cold-exhibitor readback. Finished/in-ring/pulled dogs deliberately show state, not position.

### MYK9-1023 — unchanged: offline confirmation says “Score saved”

[Canonical issue](https://linear.app/myk9-platform/issue/MYK9-1023), Backlog. Canonical P2; original source label High preserved separately, Linear normalized to Medium. Owner unassigned; first/last October 6; current baseline above; source: codex. Product UX/recovery; high confidence.

The committed deployed walk recorded offline save 58 seconds while SQL still held 65 seconds v6, followed by reconnect 58 seconds v8. Queue behavior worked; confirmation did not distinguish pending from acknowledged. Current `features/at-show/quickAdvancePanel.tsx:89` still renders bare Score saved. Added full execution contract. Closure: local-pending/acknowledged/failure tests and authorized deployed offline/reconnect save with matching durable readback and visible confirmation. No score-loss claim.

### MYK9-1024 — unchanged: blocked-delete recovery loses the entry

[Canonical issue](https://linear.app/myk9-platform/issue/MYK9-1024), Backlog. Canonical P2; original source High preserved, Linear normalized to Medium. Owner unassigned; first/last October 6; current baseline above; source: codex. Product UX/recovery; high confidence.

`features/delete/deleteBlockedAction.ts:18–20` sends a scored entry to bare `/shows/<show>/entries`; `entryManagementCockpitParams.ts:92` defaults to needs-review. The deployed walk landed on No matches instead of the scored entry's form/Pull action. The deletion guard is correct; recovery is incomplete. Added full execution contract. Reuse the existing focused-form link; closure requires a route render and authorized browser re-walk that keeps the target entry visible without manual search while preserving no-delete protection.

### MYK9-834 — unchanged: deployed expired-token offline proof remains

[Canonical issue](https://linear.app/myk9-platform/issue/MYK9-834), In Review. P2/source Medium; owner Richard Beezley; first September 26, last reconciled October 6; source: codex. Verification prerequisite, not a freshly reproduced product regression.

The earlier same-session claim fix remains in current `hooks/useAuth.ts:175–186` and `features/at-show/useRehydrateRingsideGrant.ts:142–163`. The Oct 6 offline score/reconnect walk does not test passcode tab-refocus → expired access token → full offline reload. Existing focused proof remains valid, but the exact deployed sequence, durable local score, reconnect upload and identity/revocation controls are still required. No issue closure or auth/session mutation performed.

### MYK9-639 — blocked: owner deferred Stripe TEST settlement proof

[Canonical issue](https://linear.app/myk9-platform/issue/MYK9-639), Backlog. P2/source Medium operational verification prerequisite; owner Richard Beezley; original September 17, audit lineage NCR-2026-09-19-01/-02; last reconciled October 6; source: codex.

Root-aware moved-entry settlement source remains present (`supabase/functions/stripe-webhook/paymentReconciliationLoader.ts:82` under the app, and payment-link settlement). Prior merged/applied fixes are not the controlled settlement/readback gate. Owner explicitly deferred it until after October 10. Next action then: authorized TEST moved-root replay, financial/entry settlement readback and cleanup under the existing issue's contract. No payment/load/fixture operation performed.

### MYK9-731 — resolved: fresh show-day fixture and completed walk

[Canonical issue](https://linear.app/myk9-platform/issue/MYK9-731), already Done; no status change by this audit. P2/source Medium test/harness prerequisite; owner Richard Beezley; first September 24, recurrence October 5, last October 6; source: codex.

[#2783](https://github.com/rbeezley/myk9-platform/pull/2783), `3d11bfc6a`, adds an inserts-only targeted restore with service-role grants and containment tests. Resolution rests on the completed [deployed Oct 6 cross-role walk](https://github.com/rbeezley/myk9-platform/blob/6a23286a2/docs/audits/2026-10-06-show-day-walk-claude.md), not the migration alone: live class/two entries, published schedule, secretary check-in, judge online 65 seconds v6, offline 58, reconnect 58 v8, successful ringside RPCs, exhibitor readback, seeded dogs unchanged. Extra scored day-of entry was pulled/scratched after deletion was correctly refused; residue is explicitly recorded. Linear's Oct 6 completion comment confirms the proof. This audit did not rerun shared fixture mutations.

## P3

### MYK9-1026 — unchanged: result absent from the exhibitor show-day row

[Canonical issue](https://linear.app/myk9-platform/issue/MYK9-1026), Backlog. P3/source Low, owner unassigned; first/last October 6; current baseline above; source: codex. Product UX clarity, high confidence.

The deployed walk and current `features/at-show/AtShowMyEntriesToday.tsx:55–139` show Completed and View class, but not Q/time; the result exists elsewhere. Added full execution contract and clarified that the owner's MYK9-992 policy intentionally omits position for completed dogs. Reuse existing result data/surface. Closure: focused rendered proof plus deployed released-score read showing Q/time here, preserving unreleased/private-result restrictions.

### MYK9-981 — blocked: deployed health-board action/readback

[Canonical issue](https://linear.app/myk9-platform/issue/MYK9-981), In Review. P3/source Low current client-refresh residual; owner Richard Beezley; original October 3/client finding October 4, last reconciled October 6; source: codex.

`features/admin-system-health/useRefundRequests.ts:72–74` now refreshes the alert as well as the refund query (PR #2725); prior actual-cache tests passed and applied SQL closure proof is recorded. This audit found no later deployed admin-health action demonstrating both lists update immediately. Closure still requires that authorized resolve-without-refund action/readback, not another unrelated test pass. No refund/health mutation performed.

### MYK9-1025 — resolved: reported saved-score correction case

[Canonical issue](https://linear.app/myk9-platform/issue/MYK9-1025), already Done; no status change. P3/source Low; owner Richard Beezley; first/last October 6; current baseline above; source: codex.

[#2788](https://github.com/rbeezley/myk9-platform/pull/2788), `649b8771d`, follows the walk's blank correction finding. Fresh `correctScorePrefill.test.tsx` and `correctScoreInvariant.test.tsx` pass: real sheet shows Area 1 saved time, result and faults, restores NQ/reason, and preserves authoritative totals on correction. Added proof to Linear. Source: `pages/scoring/toExistingScore.ts`, `types.ts:491–508`, at-show sheet adapter and `packages/scoring-ui/src/hooks/useScoresheetScoring.ts`.

Resolved scope is the reported AKC Scent Work case; prefill is intentionally gated to AKC Scent Work/ASCA. Other sport-specific forms are not claimed fixed. No deployed correction replay by this run.

## Verification and limits

- Frozen dependency bootstrap and package build passed after sandbox network access failed initially.
- Payment/scoring/capacity/withdrawal helpers: **10 files, 95 tests passed**, exit 0.
- Waitlist page, replica queries, offline controls and manager-capacity settings: **14 files, 111 tests passed**, exit 0.
- Dogs navigation, show header, entry forms, checkout holds, fixture contracts, notification delivery: **26 files, 231 tests passed**, exit 0.
- CI coverage gate and SQL-test registration: **2 files, 15 tests passed**, exit 0.
- Total committed focused tests: **52 files / 452 tests passed**.
- Additional diagnostic assertions: **4 expected failures**, confirming secretary mail-in deadline, two exhibitor deadline states, and checked-in missing position explanation. These use real components/providers with controlled data; no transport-to-live-database equivalence is claimed.
- The first temporary diagnostic config accidentally retained the broad include list and was stopped after stalled collection (exit 130). The narrowed config initially could not resolve app-only React dependencies from root `.logs`; a scoped dependency symlink fixed that. Both were this audit's local setup errors, not product/test-suite defects or remaining prerequisites. Successful focused runs did not hang.
- Logs/config/diagnostics retained under `/private/tmp/myk9-ncr-20261006/.logs/`. No app/test source changes, formatter-wide edits, commit, push, PR, deploy, DB write, payment or external notification.
- Behavioral SQL suites were reviewed and their CI registration tested, **not executed locally** (no database/container runtime). No full app suite, fresh deployed browser/accessibility walkthrough, live payment concurrency replay or whole-repository typecheck claimed. MYK9-1012 remains In Progress for its own shared-system proof; local tests do not close it.
- Later-fix reconciliation included mail-in dialog/message changes, successive phone-header fixes, score-prefill after the walk, and fixture restore plus actual follow-up walk. No extra defect inferred from old intermediate code.

## Tracker and evidence actions

Created **MYK9-1035**. Updated **MYK9-992, MYK9-1023, MYK9-1024, MYK9-1026, MYK9-1025** with current evidence/contracts or focused closure proof. No issues closed and no duplicates created. Existing MYK9-834/639/981 proof gates retained. Candidate MYK9-868 position scope consolidated into MYK9-992 in accordance with the later owner decision. Other already-completed historical findings were not re-reported.

The shared daily-commit-review row and automation memory both advance to `f5eb851806c33a9f01cfbb001b7eaa88f1716375`, window end `2026-10-06T20:45:49Z`, runner `codex-daily-commit-review`, run date October 6. Requested report/cursor are retained uncommitted in the primary checkout as well as the review worktree; unrelated primary files remain intact.

## Commit inventory (oldest first)

- `0fc4c544c` feat(dogs): list left, dog right on wide screens (#2769)
- `51d4d1680` docs: entries design note and Dogs status in the master-detail plan
- `35238f336` feat(payments): hold class spots while an exhibitor pays (MYK9-1012) (#2755)
- `1b9f216cf` chore(supabase): regenerate database types after the MYK9-1012 push (#2770)
- `ff2579f3a` fix(waitlist): View Wait List lists the whole judge-day; drop the second show/class selector (MYK9-1004) (#2754)
- `1a054d962` ci: drop duplicate single-runner coverage job (Test myK9Show (coverage)) (#2774)
- `e69df0040` feat(show): one expandable show header on every tab; compact Entry Management (#2773)
- `1605fb74b` fix(waitlist): judge-day cards read the server's capacity; Offer/Remove disabled offline (MYK9-1005) (#2771)
- `55a5da0aa` fix(entries): server decides capacity_override on direct client writes (MYK9-1018) (#2776)
- `077b62d2c` chore(supabase): regenerate database types after the MYK9-1005 and MYK9-1018 pushes (#2777)
- `51aae6e79` feat(waitlist): one show-wide "Allow wait lists"; classes follow it unless set on their own (MYK9-1019) (#2778)
- `59c2634df` feat(show): drop redundant titles, fold About into the header panel, fix phone header (#2779)
- `55af2aee9` feat(waitlist): track and withdraw open offers on the Waitlist tab; offer window in hours and zone (MYK9-1001, MYK9-1002) (#2772)
- `80348a309` fix(show): phone header controls fit in two rows (#2780)
- `7c49832a6` docs: define entry form, class, section and the other core terms in the glossary
- `ce626e8c8` fix(waitlist): offer message uses the dialog's deadline words; mail-in states none (MYK9-1002) (#2781)
- `485e34666` feat(entries): entry form wording and trial/class on queue rows (#2782)
- `3d11bfc6a` feat(seed): targeted restore for the show-day fixture (MYK9-731) (#2783)
- `6a23286a2` docs(audit): show-day walk 2026-10-06 report and Part 2 mechanics corrections
- `56bbe423a` refactor: remove the Layout Density setting (one comfortable spacing everywhere) (#2785)
- `1d83a239d` fix(entries): bulk labels count entries, pulls and move-ups show trial; remove Density (#2786)
- `3d0ae1d79` docs: plan the Results tab redesign (after-scoring work in one place)
- `cb4884f15` docs: Results plan — judge signs off once per day, not per class
- `12a05f76b` feat(show): rename the Entries tab to Entry Forms (MYK9-1029) (#2787)
- `649b8771d` fix(at-show): Correct this score opens with the saved score (MYK9-1025) (#2788)
- `8aa563894` docs: Results plan — store verified-against-paper per class (owner decision)
- `ac5495421` docs: Results plan — a score change clears verification (owner decision)
- `f5eb85180` fix(ringside): phone header overlap and 44px touch targets on scoring controls (#2789)
