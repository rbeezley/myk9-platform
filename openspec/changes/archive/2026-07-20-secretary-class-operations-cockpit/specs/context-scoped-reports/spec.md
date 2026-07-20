## ADDED Requirements

### Requirement: Reports inherit the invoking domain context
The system SHALL default Reports to the Show, Trial, or Class page that invoked the report action and SHALL keep Reports as the single canonical rendering surface.

#### Scenario: Report opens from Show context
- **WHEN** staff activates a supported report from a Show page
- **THEN** Reports defaults to that Show scope
- **AND** includes eligible records across that Show according to the report's inclusion rules

#### Scenario: Report opens from Trial context
- **WHEN** staff activates a supported report from a Trial page
- **THEN** Reports defaults to that Trial scope
- **AND** does not silently include sibling Trials

#### Scenario: Report opens from Class context
- **WHEN** staff activates a supported report from a Class page or focused Show Desk Class
- **THEN** Reports defaults to that Class scope
- **AND** returns to the same Class context after completion

#### Scenario: Staff deliberately changes scope
- **WHEN** the selected report supports another scope and staff changes it in Reports
- **THEN** data and any later Paperwork Print use the deliberately selected scope

### Requirement: Direct report actions respect supported scopes
The system SHALL expose direct report actions only at scopes supported by the report registry and SHALL name any deliberate broader-scope transition.

#### Scenario: Class does not support an official report
- **WHEN** an official report supports only Trial scope
- **THEN** a Class surface does not present it as a Class report
- **AND** any relevant action is labeled Open Trial report and preselects the Trial

#### Scenario: Report cannot apply to current context
- **WHEN** no supported scope can be resolved honestly from the invoking page
- **THEN** the direct report action is absent or disabled with a plain reason
- **AND** the system never silently expands to the entire Show

### Requirement: Armband Labels deduplicate by Dog Armband and Show day
The system SHALL narrow eligible Entries to the selected Report Scope and then produce one Armband Label per Dog/Armband for each included calendar day.

#### Scenario: Dog has several Classes on one day
- **WHEN** one Dog has eight included Entries on the same Show day
- **THEN** Show-scope Armband Labels contain one label for that Dog/Armband/day
- **AND** do not contain one label per Entry

#### Scenario: Dog is entered on two days
- **WHEN** one Dog has included Entries on two calendar days
- **THEN** Armband Labels contain one label for each day
- **AND** use the same Show-long Armband number on both labels

#### Scenario: Handler has multiple Dogs
- **WHEN** one Handler has two included Dogs on the same day
- **THEN** each Dog/Armband receives its own daily label
- **AND** Handler identity does not collapse the two labels

#### Scenario: Trial or Class scope narrows eligibility
- **WHEN** Armband Labels open from a Trial or Class context
- **THEN** only Entries inside that scope contribute Dog/Armband/day labels
- **AND** deduplication runs after the scope filter

### Requirement: Result Labels remain one per Entry result
The system SHALL produce one Result Label per included Entry/result and SHALL NOT deduplicate a Dog across Classes.

#### Scenario: Dog has results in several Classes
- **WHEN** one Dog has scored Entries in eight included Classes
- **THEN** Result Labels may contain eight distinct labels
- **AND** each label identifies its Trial/Class result

#### Scenario: Class scope is selected
- **WHEN** Result Labels open from one Class
- **THEN** only Entry results for that Class are included
- **AND** placement, time, and faults remain specific to each Entry

### Requirement: Paperwork Print uses the effective Report Scope and selection
The system SHALL bind staff confirmation to the effective Report Scope and actual included subjects after all report-specific selection rules.

#### Scenario: Show-scope Armband Labels are confirmed
- **WHEN** staff confirms a Show-scope Armband Label print
- **THEN** its coverage contains the deduplicated Dog/Armband/day subjects actually included
- **AND** does not claim one covered label per Entry

#### Scenario: Class-scope Result Labels are confirmed
- **WHEN** staff confirms Class-scope Result Labels
- **THEN** its coverage contains the included Entry/result subjects for that Class
- **AND** later result changes can make only the relevant coverage stale
