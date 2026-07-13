# ukc-closeout-packet

## Purpose

TBD — created by `opsx:sync` from change `ukc-closeout-packet`.

## Requirements

### Requirement: UKC packet templates are inventoried

The project SHALL register UKC Nosework official packet templates for Trial Report, Entry, Change Entry, Element Judges Book, Handler Discrimination Judges Book, and Trial Score Sheet.

#### Scenario: Template inventory is validated

- **WHEN** organization form templates are tested
- **THEN** every UKC packet template points to a local PDF source path and a runtime URL.

### Requirement: UKC entry forms are generated from existing entry data

The project SHALL let a secretary download one filled UKC Nosework Entry PDF for a selected dog or a packet for all available dogs.

#### Scenario: Secretary downloads a UKC entry form

- **WHEN** a UKC trial and dog are selected on the Reports page
- **THEN** the official PDF action offers a UKC Entry Form PDF populated with known dog, owner, armband, and UKC registration values.

### Requirement: UKC change entry forms preserve exhibitor-written fields

The project SHALL let a secretary download a UKC Change Entry PDF for a selected dog and class while leaving move-target and correction fields editable.

#### Scenario: Secretary prepares a move-up form

- **WHEN** a UKC trial, class, and dog are selected on the Reports page
- **THEN** the official PDF action offers a UKC Change Entry PDF with known host club, date, dog, owner, registration, armband, and current class values.
- **AND** move-target, correction, signature, and authorization fields remain unfilled.

### Requirement: UKC packet actions stay on Reports

The project SHALL expose UKC packet downloads through the existing Reports page and not introduce a new closeout surface.

#### Scenario: UKC trial is selected

- **WHEN** the selected trial registry is UKC
- **THEN** UKC official packet actions are available only for UKC-appropriate report IDs.
- **AND** AKC-only official actions remain hidden for the UKC trial.
