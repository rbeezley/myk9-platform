# registry-closeout-verification

## Purpose

Keep registry closeout evidence source-backed, route remediation through canonical surfaces, and ensure official Trial Secretary report values remain accurate and consistent.

## Requirements

### Requirement: Registry closeout evidence is source-backed

The project SHALL maintain a verification artifact that maps each fall-scope scent registry closeout responsibility to official source forms, local source PDFs, app surfaces, implementation status, and remediation decisions.

#### Scenario: Registry source is inventoried

- **WHEN** a registry closeout row is verified
- **THEN** the verification artifact records the official source page or form, the local repo artifact if present, the myK9 surface if present, and the remaining evidence or remediation needed.

### Requirement: Registry remediation uses canonical closeout surfaces

The project SHALL prefer the existing Reports and Submit Results surfaces for registry closeout remediation before adding new UI.

#### Scenario: Official form is missing from the app

- **WHEN** an official registry form is required but not wired into myK9
- **THEN** the remediation plan identifies whether it belongs in Reports, Submit Results, or an existing closeout flow before proposing a new surface.

### Requirement: Implementation completion is distinct from launch verification

The project SHALL keep launch evidence gates separate from code-complete status for official registry paperwork.

#### Scenario: Official PDF fill is implemented

- **WHEN** an official PDF fill exists and has automated coverage
- **THEN** the row remains launch-open until current-form comparison, print/PDF checks, and submission-recipient or portal checks are recorded.

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
