## ADDED Requirements

### Requirement: Explicit timed scoring starts ring status

Scoresheet navigation SHALL leave ring status and ring time unchanged. The live timer Start action SHALL mark an eligible dog In ring using the existing offline mutation path.

#### Scenario: Open and leave without starting

- **WHEN** the judge opens a sheet and goes Back without starting the timer
- **THEN** the entry keeps its prior status and ring time, and the first returned card reflects that state
- **PROOF** apps/myk9show/src/hooks/useScoresheetRingMove.history.test.tsx :: warm list after opening without starting

#### Scenario: Start and abandon an unscored run

- **WHEN** the judge starts the timer and leaves before saving a score
- **THEN** the start records In ring and its timestamp and leaving restores the prior check-in status
- **PROOF** apps/myk9show/src/test/e2e/verification/ringsidePhoneWalk.spec.ts :: Ringside at 375 px

#### Scenario: The entry changed while the sheet was open

- **WHEN** timing starts after the entry was pulled, scored, held for registration, or already timed by someone else
- **THEN** the scoring start leaves the existing status and stamp alone
- **PROOF** apps/myk9show/src/utils/checkInTransitions.test.ts :: leaves the current status and stamp alone
