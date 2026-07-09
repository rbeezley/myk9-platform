## ADDED Requirements

### Requirement: ASCA official packet actions

The system SHALL expose ASCA Scent Detection official closeout packet actions from the existing Reports workflow for ASCA trials.

#### Scenario: ASCA trial exposes ASCA packet artifacts

- **WHEN** a secretary views Reports for an ASCA Scent Detection trial
- **THEN** the Reports workflow SHALL offer ASCA official packet actions for Trial Report, Trial Roster, Score Sheet, Gross Receipts, Post-Event Evaluation, and Entry Form preservation

#### Scenario: Non-ASCA trial hides ASCA packet artifacts

- **WHEN** a secretary views Reports for an AKC or UKC trial
- **THEN** the Reports workflow SHALL NOT offer ASCA-only official packet actions

### Requirement: Static ASCA PDFs are preserved honestly

The system SHALL download non-fillable ASCA official PDFs as static official templates rather than generating unsupported field overlays.

#### Scenario: Non-fillable official PDF downloads unchanged

- **WHEN** a secretary downloads a non-fillable ASCA official PDF from Reports
- **THEN** the system SHALL preserve the official PDF as a static download

### Requirement: Fillable ASCA closeout PDFs use derived data only

The system SHALL fill ASCA official PDFs only with values that can be reliably derived from existing show, trial, class, entry, and secretary data.

#### Scenario: Fillable closeout form leaves human-entered fields blank

- **WHEN** a secretary downloads a fillable ASCA closeout PDF
- **THEN** the system SHALL fill derivable club/date fields and clearly named count fields and SHALL leave signatures, narrative comments, location values not present in the Reports data contract, and uncertain ASCA-only fee fields blank

### Requirement: ASCA packet coverage is tracked

The system SHALL update secretary responsibility tracking with ASCA closeout packet implementation evidence and remaining launch gates.

#### Scenario: S7.3 tracking reflects implementation state

- **WHEN** ASCA closeout packet actions are implemented
- **THEN** secretary tracking docs SHALL identify the implemented forms, tests, and remaining print/source-verification gates
