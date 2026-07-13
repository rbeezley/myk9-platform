# registry-closeout-submission-guidance

## Purpose

TBD

## Requirements

### Requirement: Submit Results offers registry-specific closeout options

The Submit Results page SHALL offer closeout submission options for AKC Scent Work, UKC Nosework, and ASCA Scent Detection without requiring a separate closeout page.

#### Scenario: Secretary selects a manual registry closeout option

- **WHEN** the secretary opens Submit Results
- **THEN** the organization selector includes AKC Scent Work, UKC Nosework, and ASCA Scent Detection options.
- **AND** UKC/ASCA options are presented as manual or portal submission paths, not electronic XML.

### Requirement: Manual closeout guidance is registry-specific

The Submit Results page SHALL show registry-specific guidance that tells the secretary what to prepare, where to submit, and what to preserve.

#### Scenario: UKC Nosework guidance is shown

- **WHEN** UKC Nosework is selected
- **THEN** the page links to the existing Reports page for the UKC packet.
- **AND** the page links to official UKC Nosework forms and paperwork guidance resources.
- **AND** XML download/send controls are not presented for UKC.

#### Scenario: ASCA Scent Detection guidance is shown

- **WHEN** ASCA Scent Detection is selected
- **THEN** the page links to ASCA's official online results/payment upload resource.
- **AND** the page explains that ASCA official packet generation remains separate from the submission record.
- **AND** XML download/send controls are not presented for ASCA.

### Requirement: Manual closeout records preserve submission history

The Submit Results page SHALL let a secretary record that a UKC or ASCA submission was completed outside myK9.

#### Scenario: Secretary marks UKC or ASCA submitted

- **WHEN** UKC Nosework or ASCA Scent Detection is selected and the secretary confirms Mark as submitted
- **THEN** myK9 records a submission history row with status `submitted`.
- **AND** no email is sent.
- **AND** no XML payload is saved for that manual record.
