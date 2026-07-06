## ADDED Requirements

### Requirement: AskQ supports explicit question modes
The system SHALL let users choose an AskQ question mode for App help, Rules, or This show inside the existing AskQ panel.

#### Scenario: User selects App help mode
- **WHEN** the user selects App help mode and submits a question
- **THEN** the request sent to AskQ includes App help mode metadata

#### Scenario: User selects Rules mode
- **WHEN** the user selects Rules mode and submits a question
- **THEN** the request sent to AskQ includes Rules mode metadata

#### Scenario: User selects This show mode
- **WHEN** the user selects This show mode and submits a question from a route with show context
- **THEN** the request sent to AskQ includes This show mode metadata and the verified show id when available

### Requirement: AskQ keeps auto-detection as fallback
The system SHALL continue to route questions without an explicit user-selected mode using server-side auto-detection.

#### Scenario: User submits without choosing a mode
- **WHEN** the user submits a question without changing the mode selector
- **THEN** AskQ routes the question using the existing question-classification fallback

#### Scenario: Auto-detected rules question is ambiguous
- **WHEN** the user submits an auto-detected rules question without enough rulebook context
- **THEN** AskQ asks which rulebook scope to use instead of answering from a guessed rulebook

### Requirement: Mode constrains allowed grounding sources
The system SHALL constrain AskQ's grounding source and tool availability according to the selected question mode.

#### Scenario: App help mode uses guide context
- **WHEN** AskQ receives an App help mode question
- **THEN** it answers only from verified user-guide context or escalates when no guide evidence supports the answer

#### Scenario: Rules mode uses rulebook context
- **WHEN** AskQ receives a Rules mode question
- **THEN** it answers only from selected rulebook context or asks for rulebook clarification

#### Scenario: This show mode uses show data tools
- **WHEN** AskQ receives a This show mode question
- **THEN** it uses show-data tools for live entries, results, classes, trials, or schedules and does not answer from rulebook text

### Requirement: AskQ examples match selected mode
The system SHALL show example questions that match the currently selected AskQ mode.

#### Scenario: Rules examples are shown
- **WHEN** the user selects Rules mode
- **THEN** AskQ shows rules examples and does not show app-help or live-data examples as primary examples

#### Scenario: This show examples are shown
- **WHEN** the user selects This show mode
- **THEN** AskQ shows live show-data examples such as results, entries, schedules, or class status

#### Scenario: App help examples are shown
- **WHEN** the user selects App help mode
- **THEN** AskQ shows app workflow examples backed by verified user guides

### Requirement: AskQ mode UI does not duplicate existing surfaces
The system SHALL implement question mode selection within the existing AskQ panel rather than creating a new page or separate assistant surface.

#### Scenario: User opens AskQ
- **WHEN** the user opens AskQ from the app shell
- **THEN** mode selection is available in that panel without navigating to a new page
