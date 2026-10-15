# exhibitor-count-integrity Specification

## Purpose

Every exhibitor-facing counter (entries, entered shows, entries received, per-dog upcoming) agrees with the list it summarizes and is labeled to say exactly what it counts, so numbers never contradict each other across surfaces.

## Requirements

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

### Requirement: Public entries-received counter reflects accepted entries

The show landing page's entries-received counter SHALL reflect the show's actual entry count from the sanctioned public read path, not render zero when entries exist.

#### Scenario: Show with existing entries

- **WHEN** a show with accepted entries renders its public landing roster section
- **THEN** the entries-received figure is non-zero and consistent with what the show team sees

### Requirement: Grouped entry counts include unpublished entries consistently

My Shows filter counts SHALL count the class-entry rows rendered under the same time and status scope, including an exhibitor's unreadable show entries. Each rendered class-entry row SHALL count once, across all dogs and orders. The label SHALL name class entries. Per-dog upcoming schedule counts SHALL agree with the Activity list or explicitly distinguish entries whose schedule is unavailable.

#### Scenario: Mixed order grouping

- **WHEN** one order contains two dogs and another order contains a second class for one of those dogs
- **THEN** the corresponding count describes all three class-entry rows beneath the two dog cards

#### Scenario: Unpublished entry

- **WHEN** an unreadable-show card is rendered in Upcoming
- **THEN** its class-entry rows are included in Upcoming and matching status counts
