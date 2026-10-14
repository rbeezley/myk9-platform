# Spec Delta

## Purpose

An entry a show's organizer makes for a dog that has no registration number for the trial's registry holds its capacity place, is surfaced for follow-up, and is kept off official show paperwork until a number exists.

## ADDED Requirements

### Requirement: Organizers may enter a dog without a registration number

The system SHALL accept a new entry for a dog with no registration number for the trial's registry when the person inserting it can manage that trial. It SHALL continue to refuse such an entry from anyone else. The conformation-puppy exemption is unchanged.

#### Scenario: Secretary keys a mail-in with no number

- **WHEN** a secretary who manages the trial saves an entry for a dog with no registration for the trial's registry
- **THEN** the entry is created and counts toward class and judge-day capacity like any other entry

#### Scenario: Exhibitor self-service entry is still refused

- **WHEN** an exhibitor submits an entry for their own dog with no registration for the trial's registry
- **THEN** the entry is refused, and the exhibitor is told the dog needs a registration number for that registry

#### Scenario: Offline secretary entry uploads later

- **WHEN** a secretary records such an entry offline and the device reconnects
- **THEN** the upload is accepted under the secretary's identity, exactly as an online save would be

### Requirement: Held entries are derived, not stored

The system SHALL treat an entry as awaiting a registration number exactly when it is live and its dog has no registration whose organization matches the trial's registry. This uses the same registry resolution the entry rule uses, with a blank registry meaning AKC. Adding the number SHALL end the held state with no further action.

#### Scenario: Adding the number releases the entry

- **WHEN** a secretary adds the missing registration to a held entry's dog
- **THEN** the entry no longer appears as awaiting a number, and it appears on paperwork from then on

#### Scenario: A registration for another registry does not count

- **WHEN** a dog entered in a UKC trial has only an AKC registration
- **THEN** the entry is still awaiting a UKC registration number

### Requirement: Held entries are kept off official paperwork

The system SHALL leave entries awaiting a registration number out of every listing of who runs. It SHALL keep counting them toward capacity.

#### Scenario: Paperwork omits a held entry

- **WHEN** the show catalog, a class run sheet or run order, a printed or paper scoresheet, or the emergency trial packet is produced for a class containing a held entry
- **THEN** the held entry is not listed

#### Scenario: Capacity still counts a held entry

- **WHEN** a class is at its limit and one of its entries is held
- **THEN** the class still reads as full, and the next entry is waitlisted or refused as it would be otherwise

### Requirement: Held entries are never withdrawn automatically

The system SHALL NOT withdraw, pull or refund an entry because it is awaiting a registration number. Resolving it is a secretary action using the existing withdraw and pull controls.

#### Scenario: Show day arrives with an unresolved hold

- **WHEN** a held entry is still unresolved on show day
- **THEN** it stays an entry awaiting a number and is still left off paperwork, until a secretary adds the number or pulls or withdraws it
