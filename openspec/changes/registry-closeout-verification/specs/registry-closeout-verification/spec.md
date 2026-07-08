## ADDED Requirements

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
