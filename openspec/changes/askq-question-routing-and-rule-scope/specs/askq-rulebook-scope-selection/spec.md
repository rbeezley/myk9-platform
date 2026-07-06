## ADDED Requirements

### Requirement: Rules mode requires a selected rulebook scope
The system SHALL require a specific rulebook scope before answering official rules questions when the organization or sport is ambiguous.

#### Scenario: Ambiguous rules question outside show context
- **WHEN** the user asks "What's the max time in Excellent Containers?" outside verified show context without selecting a rulebook scope
- **THEN** AskQ asks which organization and sport rulebook to use instead of answering

#### Scenario: Explicit AKC scope
- **WHEN** the user asks a rules question with AKC Scent Work selected
- **THEN** AskQ answers only from the AKC Scent Work rulebook context

#### Scenario: Explicit UKC scope
- **WHEN** the user asks a rules question with UKC Nosework selected
- **THEN** AskQ answers only from the UKC Nosework rulebook context

### Requirement: Verified show context preselects available rulebook scope
The system SHALL derive available rulebook scope from verified show/trial context when a user asks rules questions from a show context.

#### Scenario: Show has one rulebook scope
- **WHEN** the user asks a rules question from a verified show with one matching trial rulebook
- **THEN** AskQ uses that rulebook without asking for clarification

#### Scenario: Show has multiple rulebook scopes
- **WHEN** the user asks a rules question from a verified show with multiple matching trial rulebooks and the question does not identify which trial/sport applies
- **THEN** AskQ asks which available show rulebook scope to use

#### Scenario: Show context limits rulebooks
- **WHEN** the user asks from a verified show context
- **THEN** AskQ does not answer from rulebooks outside that show's trial-derived rulebook set

### Requirement: Rulebook scope is validated server-side
The system SHALL validate client-provided rulebook scope against bundled rulebook metadata and verified show context before building the document context.

#### Scenario: Unknown organization
- **WHEN** the client sends an unknown organization code
- **THEN** AskQ does not build rulebook context from that value and returns a clarification or validation response

#### Scenario: Unknown sport
- **WHEN** the client sends an organization with an unsupported sport code
- **THEN** AskQ does not select a guessed rulebook and returns a clarification or validation response

#### Scenario: Scope conflicts with verified show context
- **WHEN** the client sends a rulebook scope that is not available for the verified show
- **THEN** AskQ rejects that scope for the request and asks the user to choose from the show's available rulebooks

### Requirement: Rules answers identify the rulebook used
The system SHALL label rules answers with the rulebook source used to answer.

#### Scenario: Answer from selected rulebook
- **WHEN** AskQ answers a rules question from selected rulebook context
- **THEN** the answer includes a concise source label naming the organization and sport rulebook

#### Scenario: Rulebook does not cover answer
- **WHEN** the selected rulebook context does not cover the user's rules question
- **THEN** AskQ says it cannot determine the answer from the selected rulebook and does not guess from another source
