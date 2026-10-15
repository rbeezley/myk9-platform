# Verification evidence

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
