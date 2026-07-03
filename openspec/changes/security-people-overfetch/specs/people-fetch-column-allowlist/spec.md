## ADDED Requirements

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
