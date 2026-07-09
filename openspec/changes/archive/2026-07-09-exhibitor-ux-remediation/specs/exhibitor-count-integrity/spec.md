# exhibitor-count-integrity

## ADDED Requirements

### Requirement: Counters agree with the lists they summarize
Every exhibitor-facing counter SHALL be derived from the same scoped query as the list or detail view it summarizes, and its label SHALL state what it counts (e.g. "class entries" vs "shows entered").

#### Scenario: Dashboard stats vs My Entries tabs
- **WHEN** the exhibitor dashboard stats strip and the My Entries tab counts render for the same account at the same time
- **THEN** equal scopes show equal numbers, and differing scopes are labeled distinctly enough that both cannot be read as "my entries" with different values

#### Scenario: Entered-shows tab reflects actual entries
- **WHEN** an exhibitor with at least one entry in a listed show opens the Shows page
- **THEN** the "Entered" tab count includes that show (not zero)

#### Scenario: Per-dog upcoming count matches the dog's activity view
- **WHEN** a dog card displays "N upcoming classes"
- **THEN** opening that dog's page shows the same N upcoming entries in its Activity list

### Requirement: Public entries-received counter reflects accepted entries
The show landing page's entries-received counter SHALL reflect the show's actual entry count from the sanctioned public read path, not render zero when entries exist.

#### Scenario: Show with existing entries
- **WHEN** a show with accepted entries renders its public landing roster section
- **THEN** the entries-received figure is non-zero and consistent with what the show team sees
