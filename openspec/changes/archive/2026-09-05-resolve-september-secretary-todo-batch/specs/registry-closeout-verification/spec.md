## ADDED Requirements

### Requirement: Trial Secretary report values are year-aware and consistent

The Trial Secretary preview, print path, and downloadable official form SHALL derive eligible runs, fee rate, and total from one policy keyed by the authoritative trial event date.

#### Scenario: Supported historical event uses historical rate

- **WHEN** a Trial Secretary report is generated for a supported 2025 event
- **THEN** every output applies the documented 2025 rate to the same eligible-run count

#### Scenario: 2026 event excludes ineligible runs

- **WHEN** a 2026 trial has 136 total entries and 2 withdrawn, scratched, cancelled, or otherwise ineligible runs
- **THEN** every output reports 134 paid runs at $4.50 and a $603.00 total

#### Scenario: Event date cannot select a supported rate

- **WHEN** the authoritative event date is missing, invalid, or outside the supported fee schedule
- **THEN** the report blocks the outdated default and states the recovery required to generate an accurate report

### Requirement: Trial Secretary instructions use the canonical form

The Reports surface SHALL present current submission timing and address instructions from the canonical downloadable form, or SHALL omit the stale alternate instructions in favor of that form.

#### Scenario: Secretary compares preview and download

- **WHEN** a secretary opens the Trial Secretary report and downloads or prints it
- **THEN** the visible instructions do not contradict the canonical form used for download
