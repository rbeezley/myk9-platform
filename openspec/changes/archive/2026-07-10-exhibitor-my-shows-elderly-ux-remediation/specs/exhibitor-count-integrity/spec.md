# exhibitor-count-integrity Delta

## MODIFIED Requirements

### Requirement: Counters agree with the lists they summarize

Every exhibitor-facing counter SHALL be derived from the same scoped query as the list or detail view it summarizes, and its label SHALL state what it counts (e.g. "class entries" vs "shows entered"). On the My Shows page, differing scopes SHALL carry explicit visible scope labels: the summary metric SHALL be labeled as current-scope ("Current entries" with an upcoming/in-review qualifier) and the entries-list section SHALL visibly state that it includes past entries ("All entries" with an "includes past shows" note or equivalent).

#### Scenario: Dashboard stats vs My Entries tabs

- **WHEN** the exhibitor dashboard stats strip and the My Entries tab counts render for the same account at the same time
- **THEN** equal scopes show equal numbers, and differing scopes are labeled distinctly enough that both cannot be read as "my entries" with different values

#### Scenario: Current vs all-entries scope is explained on screen

- **WHEN** an exhibitor has past entries so the current-entries metric and the all-entries count differ (e.g. 9 vs 13)
- **THEN** the summary metric visibly reads as current-scope and the entries section visibly states it includes past shows, so both numbers are explained without interpretation

#### Scenario: Entered-shows tab reflects actual entries

- **WHEN** an exhibitor with at least one entry in a listed show opens the Shows page
- **THEN** the "Entered" tab count includes that show (not zero)

#### Scenario: Per-dog upcoming count matches the dog's activity view

- **WHEN** a dog card displays "N upcoming classes"
- **THEN** opening that dog's page shows the same N upcoming entries in its Activity list
