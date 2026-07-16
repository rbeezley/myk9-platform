## ADDED Requirements

### Requirement: Staff Class Details shows a compact readiness summary
The existing staff Class Details surface SHALL show a compact readiness summary derived from the class and entry data already used by the page. It SHALL present total entries, attention/payment work, check-in progress, and scored progress without introducing a new page or manually assigned health grade.

#### Scenario: Secretary opens a populated class
- **WHEN** an authorized secretary opens Class Details for a class with entries
- **THEN** the page shows factual readiness metrics for that class
- **AND** the secretary run sheet remains the primary class content

#### Scenario: Exhibitor opens the same class
- **WHEN** an exhibitor or anonymous visitor opens Class Details
- **THEN** the staff operational readiness summary is not rendered

#### Scenario: Class entries are still loading
- **WHEN** the class entry source has not finished loading
- **THEN** the summary shows a compact loading state rather than confident zero values

#### Scenario: Class entry load fails
- **WHEN** the class entry source fails
- **THEN** the summary does not claim that the class has zero attention items
- **AND** the existing page-level recovery remains available

### Requirement: Readiness metrics route to existing owner surfaces
Every actionable readiness metric SHALL navigate to the existing surface that contains the clearing affordance, preserving class context. The change SHALL NOT recreate entry management, ordering, or scoring actions inside the summary.

#### Scenario: Attention metric opens Entry Management
- **WHEN** a secretary activates an entry-attention metric
- **THEN** the existing Entry Management page opens for the same show and class with the matching filter applied

#### Scenario: Check-in metric opens day-of entry work
- **WHEN** a secretary activates the check-in metric
- **THEN** the existing class-scoped Entry Management day-of view opens with check-in controls visible

#### Scenario: Scored metric opens the class scoresheet
- **WHEN** a secretary activates the scored-progress metric
- **THEN** the existing dedicated class scoresheet opens
- **AND** Class Details does not add a second scoring workflow

#### Scenario: Metric has no clearing destination
- **WHEN** a proposed metric cannot link to a surface containing its clearing action
- **THEN** the system does not render that metric as an actionable readiness chip

### Requirement: Class lifecycle remains server authoritative
The readiness summary SHALL use canonical server class status and `is_scoring_finalized` for completion state. It MUST NOT infer class completion from raw scored-count equality.

#### Scenario: Scratched entry remains unscored in a completed class
- **WHEN** the server marks a class completed because all expected entries are accounted for while one scratched entry is unscored
- **THEN** the readiness summary preserves the completed lifecycle state
- **AND** a lower raw scored count does not relabel the class as incomplete

### Requirement: Readiness remains useful with show-day connectivity loss
The readiness summary SHALL derive from replicated or already-loaded class/entry data and SHALL NOT add a blocking network dependency to Class Details.

#### Scenario: Connection drops after class data loads
- **WHEN** a secretary has loaded the class and connectivity is lost
- **THEN** the readiness summary remains visible from available replicated or cached data
- **AND** the page does not present connectivity loss as an error

### Requirement: Readiness controls are accessible and calm
Actionable readiness controls SHALL meet the existing touch-target, contrast, keyboard, and plain-language requirements for staff UX.

#### Scenario: Secretary uses a tablet outdoors
- **WHEN** the readiness summary renders on a tablet viewport
- **THEN** each action has at least a 44-by-44-pixel target
- **AND** no action depends on hover or gesture-only discovery

