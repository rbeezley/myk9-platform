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
- Disposable same-day live fixture prepared but NOT applied: automatic approval review rejected the shared-data fixture write. Explicit approval requested; no fixture rows were written.

Final deployed proof and completion verification will be recorded here before archive.
