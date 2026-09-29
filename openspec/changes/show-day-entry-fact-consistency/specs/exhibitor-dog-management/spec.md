# Spec Delta

## ADDED Requirements

### Requirement: Dog page shows same-day preliminary platform results

The existing dog page SHALL show a scored run on its trial date, including its result and time, with a link to the show/class result. Before class results are released, it SHALL label the result preliminary and withhold placement. A failed online result read SHALL not falsely claim that the dog has no results.

#### Scenario: Score recorded during today's trial

- **WHEN** an accepted entry is scored qualified at 43.21 seconds on today's trial
- **THEN** the dog's existing activity and Past Results areas include the run and a path to its class result
- **AND** placement is withheld and the score is labeled preliminary until release

#### Scenario: Results released

- **WHEN** the class results are released
- **THEN** the dog page may display its final placement

#### Scenario: Results read unavailable

- **WHEN** the current result read fails and no verified result set is available
- **THEN** the dog page presents an unavailable or retry state rather than a factual no-results claim

#### Scenario: Release fact missing

- **WHEN** a cached result has no verified class release fact
- **THEN** the dog page does not call it preliminary or show placement as final

#### Scenario: Dog roster paused

- **WHEN** the owner dog-roster query is disabled or paused without data
- **THEN** Past Results offers an unavailable/retry state instead of loading forever
