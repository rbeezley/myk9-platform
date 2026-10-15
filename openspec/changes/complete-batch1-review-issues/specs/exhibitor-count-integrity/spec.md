## ADDED Requirements

### Requirement: Grouped entry counts include unpublished entries consistently

My Shows filter counts SHALL count the class-entry rows rendered under the same time and status scope, including an exhibitor's unreadable show entries. Each rendered class-entry row SHALL count once, across all dogs and orders. The label SHALL name class entries. Per-dog upcoming schedule counts SHALL agree with the Activity list or explicitly distinguish entries whose schedule is unavailable.

#### Scenario: Mixed order grouping

- **WHEN** one order contains two dogs and another order contains a second class for one of those dogs
- **THEN** the corresponding count describes all three class-entry rows beneath the two dog cards

#### Scenario: Unpublished entry

- **WHEN** an unreadable-show card is rendered in Upcoming
- **THEN** its class-entry rows are included in Upcoming and matching status counts
