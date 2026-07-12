## ADDED Requirements

### Requirement: Client class-status derivation agrees with the server
The client-side class/scoring-status derivations (`@myk9/core` `getClassDisplayStatus` and `@myk9/ringside` `classStatus.ts`) SHALL use the same expected/accounted-for completeness definition as the server derivation, or SHALL defer to the server's `is_scoring_finalized` signal for the "completed" verdict, so that a client never renders a class status that contradicts the server-stored status. The two client derivations SHALL agree with each other for the same inputs.

#### Scenario: Client does not contradict a server-completed class
- **WHEN** the server has set a class `completed` with `is_scoring_finalized = true`, and a client's local entry snapshot is mid-sync and still shows one entry unscored
- **THEN** the client renders the class as completed (deferring to `is_scoring_finalized`), not "in progress"

#### Scenario: Client excludes scratched entries from completeness like the server
- **WHEN** a class has all expected entries accounted-for but one scratched entry unscored
- **THEN** the client's `getClassDisplayStatus` derives "completed" (the scratched entry is excluded from expected), matching the server

#### Scenario: Core and ringside derivations match
- **WHEN** the same class entry counts are passed to `@myk9/core` `getClassDisplayStatus` and the `@myk9/ringside` classifier
- **THEN** both return the same display status
