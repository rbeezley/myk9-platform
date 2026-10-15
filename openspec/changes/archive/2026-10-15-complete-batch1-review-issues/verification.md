# Verification evidence

**Final status (2026-10-15):** Implementation PR #3003 merged, required migrations applied, production commit `9936b9b22b53c64a13d943830d6d0cffd9fbf290` verified, and all four issues Done. Earlier sections below are chronological history; the final acceptance section supersedes their pending states and failed runs.

## Artifact coverage: 90/100 → 100/100

Added explicit offline placeholder/reload, atomic invalid-date failure, release commit identity, counter unit and fixture cleanup coverage after the initial plan audit. Implementation verification and live closure remain pending.

| Requirement                                                                   | Artifact evidence                                  |
| ----------------------------------------------------------------------------- | -------------------------------------------------- |
| MYK9-1117 form/schema/breed coverage and both save contracts                  | tasks 1.2–1.4; dog-record-field-integrity delta    |
| MYK9-1172/1193 chronological order on all three surfaces                      | tasks 2.1/2.4; exhibitor-my-shows-legibility delta |
| MYK9-1147 truthful labels and consistent explicit count scope                 | tasks 2.2–2.4; exhibitor-count-integrity delta     |
| Existing offline, authorization, money and owner decisions preserved          | design Decisions/Risks; tasks 1.3/1.4              |
| Required review, CI, merge, migration, deployment and readback before closure | tasks 1.5/2.5/3.1–3.5                              |

## Executed so far

- Registration transport assertion-first: four failures at panel/RPC boundaries, then passing.
- Registration placeholder and reload: four expected failures, then passing.
- Missing class render: Unknown Class assertion failed, then passed with truthful unpublished copy.
- Explicit class-entry count and unknown schedule copy: expected red then green (60 tests).
- Shared registration save/breed and dog registration reload suites: 42 passed.
- Rolled-back SQL function/fixtures: supplied date, blank date, malformed-date atomicity and anon ACL controls passed; transaction ROLLBACK confirmed. No migration applied yet.
- Code-quality ratchet: exit 0.

- Number-first journey exposed the missing date field on the initial step: two tests failed, then all 27 passed after reusing RegistrationDateField. Actual create payload carries 2026-09-23.
- Existing local-first exact-payload contract updated for nullable date: 28 passed.
- Full shuffled run: 2,953 files / 28,807 tests passed, one old exact-payload expectation failed and was corrected; a new integrated run is in progress. A superseded run was stopped when the initial-step omission was discovered (exit 143), not counted as passing.
- Final lint: 0 errors / 36 existing warnings; quality ratchet and strict OpenSpec validation passed.
- Migration version guard: passed for 20261015030017 against main, local refs and linked database.
- Local browser My Shows: Upcoming 24=24 class rows, Completed 11=11, All 35=35. Unpublished card has Paid/Willow, two Class not published yet labels and no date; Willow strip separates 8 scheduled +2 unpublished classes.
- Local secretary browser People-at-show DOM assertion: Willow trials 1,2,3,4,5,6,7; Ranger trial 1 separately. Existing show-page schedule lists Oct14–20 in order.
- Local initial form screenshot confirms native optional date input and Registered Breed. Registry lookup was stubbed for this UI-only check because its merged dependency migration is not yet deployed.
- No shared-data fixtures were written. Verification now uses rollback-only authenticated SQL and read-only browser response fixtures; no fixture approval is needed.

Final deployed proof and completion verification will be recorded here before archive.

## Integrated run and final test stabilization

- Integrated shuffled suite: 2,958 files / 28,831 tests passed, two failures in ManageRegistrationsPanel.mode. The Add journey exceeded 10 seconds; its unfinished SR999 typing leaked into the next Edit input (`CH Test DogS RI9I99`), explaining the second failure.
- Save-contract helpers now click/clear/paste whole values and wait for picker closure (organization return focus, breed aria-expanded=false). These tests verify payloads; separate tests retain typing/keyboard accessibility coverage. All 30 affected journey tests pass shuffled in 6.12 seconds. CI remains required for the final head; local broad runs are not claimed wholly green.
- Final source typecheck: all 26 monorepo tasks passed after main integration.

## Review corrections and current checks

- Independent Claude attempt returned ten findings but no recognized verdict contract (wrapper exit 2); it is not counted as gate evidence. Verified fixes cover mixed-status class rows/counts, explicit Class entries label, draft-only warning, existing registry/status preservation, wizard width and repeated grouping. Strict registration numbers remain as expressly owner-approved; all 85 live registrations were surveyed, with zero nonempty invalid numbers.
- Reviewed focused suite: 10 files / 143 tests passed. App typecheck completed through API checks; lint has zero errors / 36 existing warnings and quality ratchet passed.
- Full shuffled reviewed suite: 2,952 files / 28,823 tests passed, 11 failed tests and one worker startup timeout. Two obsolete All entries assertions were corrected to Class entries. All nine failed/worker files then passed shuffled: 101 tests. The broad run is not claimed wholly green; final-head CI remains required.
- Authenticated owner RPC/date readback, blank date, invalid-date rejection and ACL controls passed in a rolled-back transaction. No persistent records or migration were applied by this proof.

## Owner-approved status restructure

- Owner approved the raw-status design and continuation after the identified picker-context correction (2026-10-15, chat and Linear comment). Removed originalStatus metadata, normalization and save-time branching. A single bounded nonempty status now goes directly through both save contracts. The trigger shows the raw current value; a plain popup note describes a legacy value while the four standard options remain fixed.
- Assertion-first: 11 old-behavior failures reproduced. Final focused result: 6 files / 63 tests passed shuffled, including pending/approved/suspended/rejected, explicit Active selection, exact DB payload, breed accessibility, and offline registration journeys. The five failed correction attempts are not counted as passing; owner explicitly authorized the identified final fix.
- Final monorepo typecheck: all 26 tasks passed. Lint: zero errors. Code-quality ratchet passed. Fresh whole-app shuffled run is pending. Prior remote-head CI passed; its review gate was withdrawn for the P3 and is not evidence for this redesign.
- Live dependency survey: registry_identity_taken is absent, held-entry replication view column is absent, latest applied migration is 20261014191300. The release requires the two already-merged dependency migrations plus this batch's registration-date migration.

## Final local validation

- Whole app suite shuffled with four workers: 29,025 tests passed, 11 skipped, one todo, exit 0 (1025.78 seconds). No source edits landed during the run; only OpenSpec prose changed. This supersedes the earlier non-green broad attempts.
- Unmocked final local browser parity: Upcoming 24/24, Completed 11/11, All 35/35, Pending 4/4, Accepted 25/25, Any status 35/35. Draft card says Show not published yet, Paid and Willow, with two unpublished classes and no date. My Shows and People at show both list trials 1–7 chronologically. Existing-registration edit displays its optional date and organization; an explicit UKC choice works without saving. Owned sessions closed.
- Migration dry run succeeded and names exactly registry_identity_taken, held_entries and this batch's registration_date migration, with no seeds or role changes. Nothing applied before merge.

## Merged and applied evidence

- Implementation PR #3003 merged as 9936b9b22b53c64a13d943830d6d0cffd9fbf290 after exact-head review of d23737c4f4737b4474715882a70a5117d29836d8. Claude's all-severity verdict was No actionable defects found; review evidence comment 6195489479 records the prior finding addressed. PR CI run 38758094358 and the pinned-head checker both passed, with nothing outstanding.
- From the clean linked worktree on merged main, the second dry run named exactly the three expected migrations. Applied 20261014194300, 20261014214300 and 20261015030017 successfully with vault changes explicitly skipped and no seeds/roles.
- Against the applied function: authenticated owner date readback, empty date, invalid-date rejection and ACL checks passed; transaction ROLLBACK confirmed. Follow-up catalog check confirms zero people/auth/dog fixtures remain. Table ACL, column ACL, function ACL, security_definer and empty search_path match the pre-migration baseline exactly. The lookup is executable by authenticated and not anon; the required held view column exists.
- Regenerated types from the applied database: two awaiting_registration_number view fields and entry_awaiting_registration_number function are new; PostgrestVersion metadata changed from14.5 to14.1 and is retained as generated. Supabase build and its two package tests passed. All26 monorepo typecheck tasks passed with force/cache disabled against the generated types.
- Complete read-only local browser proof after application passed all checks: actual authenticated registry lookup returned200/false, optional create date accepted2026-09-23, Registered Breed field exists, edit displays the stored organization/breed and empty date, counts/draft card and both real seven-day lists pass. Wrapper cleanup timed out; the exact owned session was explicitly closed successfully afterward. No browser save or persistent fixture was made.
- Merging automatically marked MYK9-1117 Done; restored it to In Progress because the authorized production evidence gate is still pending. All four issues remain In Progress until deployed verification passes.

## Final production acceptance and implementation verification

Deployment [38761764368](https://github.com/rbeezley/myk9-platform/actions/runs/38761764368) succeeded after green merge-commit CI [38759935095](https://github.com/rbeezley/myk9-platform/actions/runs/38759935095). Selected and served SHA: 9936b9b22b53c64a13d943830d6d0cffd9fbf290. The workflow metadata head is the newer1c17f5305; its build checkout, stamp and independent domain read confirm the requested9936b9b22 was deployed.

Unmocked deployed browser (configured exhibitor/secretary) passed: Upcoming24/24, Completed11/11, All35/35, Pending4/4, Accepted25/25, Any35/35; phone390×844 draft card says Show not published yet/Paid/Willow with two Class not published yet rows and no date; My Shows and People list trials1–7 chronologically. Actual authenticated lookup returned200/false; create date2026-09-23 is optional, and edit displays stored organization/breed/empty date. No browser save was made. The applied authenticated RPC/readback and real save/reload/offline regression tests provide the persistence proof.

Fresh deployed read-only controlled responses passed9AM→10AM→untimed on My Shows and the show schedule; People lists Willow trials2(09:00),1(10:00),3(untimed), with another dog's row separately. Rewrites never add missing projected fields and were installed before sign-in/initial replication. Both production scripts exited0 and their owned sessions closed. Console errors were only intentionally blocked analytics_events writes; the unrelated hero preload warning was also observed. No persistent shared fixtures remain.

All four full Linear issues were re-read against their criteria, received sanitized production evidence/CI/deploy comments, and were moved to Done: MYK9-1117, MYK9-1172, MYK9-1193, MYK9-1147. Screenshot upload to Linear was rejected by automatic approval review because of possible sensitive production data. No image was exported; local screenshots/logs are preserved and the issues contain sanitized proof and release links.

| Dimension    | Result                       | Evidence                                                                                                                                                           |
| ------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Completeness | 15/15 tasks,4/4 requirements | Merged implementation, applied migrations/types comparison, deployed proof and tracker closure complete                                                            |
| Correctness  | 7/7 scenarios covered        | Real form/DB/offline/reload tests, rolled-back applied SQL, rendered count parity, unpublished phone card, real days and controlled times                          |
| Coherence    | Pass                         | One form/schema and ordering rule, existing mutation/replication paths, owner-approved raw status/strict numbers/optionC, no duplicated surfaces or new draft read |

No critical, warning or suggestion remains for the scoped implementation. Prior failed runs and review findings above are superseded by the complete passing run and final exact-head review; they are retained as evidence history. Post-verification lifecycle is spec sync/archive, the immediate generated-types/evidence PR, and cleanup.

The follow-up in-flight scan initially stopped on the user's unrelated dirty primary audit-boundary.md. The documented warning-mode scan was inspected rather than treated as a clean gate: its actionable inventory hits are already-merged local branches. The batch source tip exactly equals PR3003's merged head; worktree-myk9-1134 tip e3f090d6 exactly equals merged PR2958's upstream head. Its old type snapshot lacks functions already present on main. No open PR or active worktree overlaps these follow-up paths; unrelated primary edits remain untouched.

## Repository lifecycle completion

The immediate follow-up carries generated declarations and verification/spec records only; the implemented code was already reviewed and merged in PR #3003. This docs/planning archive is therefore based on that merged implementation rather than the housekeeping branch. All 15 tasks and four planning artifacts are complete. Four requirements/seven scenarios were synced into the three main specs, preserving all pre-existing text. Ordinary validation passes all three; strict validation flags only pre-existing long requirements in count/legibility specs. The change is archived as `2026-10-15-complete-batch1-review-issues`. After integrating main `1c17f5305`, all 26 typecheck tasks, lint and code-quality ratchet passed again. The follow-up changes no application runtime or migrations and requires no additional frontend deployment.
