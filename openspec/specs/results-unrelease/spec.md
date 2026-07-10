# results-unrelease Specification

## Purpose
Let a secretary return released class results to held-for-review with an explicit confirmation, limited to classes whose visibility is actually gated by manual release timing, with partial failures surfaced and retryable.

## Requirements
### Requirement: Secretary can un-release class results

The Results Control surface SHALL let a secretary return released classes to held-for-review by clearing the release timestamp and releaser, behind an explicit confirmation that notes already-viewed pages will not retroactively refresh.

#### Scenario: Un-release hides results from exhibitors

- **WHEN** a secretary confirms "hide results" for a released class
- **THEN** `results_released_at` and `results_released_by` are cleared for that class and exhibitor-facing result visibility gates treat the class as unreleased

#### Scenario: Action only offered for released classes

- **WHEN** the secretary's selection contains no released classes
- **THEN** the un-release action is not offered

#### Scenario: Partial failure is retryable

- **WHEN** un-release is applied to multiple classes and some writes fail
- **THEN** successful classes remain unreleased, failures are surfaced, and the action can be retried for the failed classes
