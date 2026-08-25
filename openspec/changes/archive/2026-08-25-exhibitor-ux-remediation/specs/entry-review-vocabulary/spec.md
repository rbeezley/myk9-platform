## ADDED Requirements

### Requirement: Exhibitor-facing review states use the canonical vocabulary

Exhibitor-facing renderings of an entry's review state SHALL source their label from the same shared mapping module used by secretary surfaces, rather than deriving labels independently per surface. Where the exhibitor-facing wording must differ from the secretary-facing wording for the same underlying state, that wording SHALL be defined in the shared module as an explicit exhibitor variant, not invented at the call site.

#### Scenario: One state reads consistently across exhibitor surfaces

- **WHEN** the same entry's review state renders on the My Shows entry card and on the show-detail run schedule
- **THEN** both render the same exhibitor-facing label for that state

#### Scenario: Labels come from the shared module

- **WHEN** an exhibitor-facing review-state label is rendered
- **THEN** its text originates from the shared review-state mapping module

### Requirement: An entry awaiting review is never described as not accepted

An entry whose review is still pending SHALL NOT be labelled with wording that denotes refusal. Wording denoting refusal SHALL be reserved for entries that have actually been declined, and SHALL be accompanied by a reason or a next step.

#### Scenario: Pending entry on the run schedule

- **WHEN** an entry is awaiting secretary review and appears on the show-detail run schedule
- **THEN** its label conveys that review is pending
- **AND** it does not read as "Not accepted" or other refusal wording

#### Scenario: Consistency with the entry card

- **WHEN** the same entry renders on the My Shows entry card as awaiting review
- **THEN** the run-schedule label conveys the same meaning, so the two surfaces cannot be read as contradicting each other

#### Scenario: A genuinely declined entry

- **WHEN** an entry has actually been declined by the show
- **THEN** it is labelled with refusal wording
- **AND** a reason or next step accompanies it
