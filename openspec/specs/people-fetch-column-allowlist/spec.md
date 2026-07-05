# people-fetch-column-allowlist Specification

## Purpose
SA-008 defense-in-depth (half 2). The people-directory fetch (`getAllUsers`)
selects an explicit column allowlist — the union of the columns its two mappers
consume (`mapDatabaseToUser` for the userStore and `mapDbUserToUser` for React
Query) — rather than `select('*')`. Even if the `people_select` RLS policy is
later loosened, only allowlisted columns are shipped, never a full-table PII
dump. The list is behavior-identical to the previous wildcard for existing
consumers and is pinned by a column-shape assertion test.

## Requirements
### Requirement: People directory fetch uses an explicit column list
The system SHALL query the `people` table with an explicit column list rather
than `select('*', ...)`, including only the columns and joins (`user_roles`,
`judge_qualifications`) that a consuming surface actually renders.

#### Scenario: Fetch omits the wildcard select
- **WHEN** the people directory is fetched for any consuming surface
- **THEN** the query builder is called with an explicit column list, not `'*'`

#### Scenario: Column list matches actual render usage
- **WHEN** a consuming surface renders a subset of person fields
- **THEN** the fetched column list includes exactly the fields that surface
  renders, verified by an assertion on the exact call arguments
