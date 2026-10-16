# Spec Delta

## ADDED Requirements

### Requirement: Exceptions include entries awaiting a registration number

The Entries cockpit Exceptions list SHALL include a "Registration number needed" pane beside move-ups, pulls and waitlist. Its count SHALL equal the number of live entries in the show awaiting a registration number. Each row SHALL name the dog, the exhibitor and the trial registry, and SHALL offer:

- a way to add the registration on the dog;
- the existing pull and withdraw actions;
- the lifecycle reminder described in `show-lifecycle-emails`.

#### Scenario: Held entries are listed with a count

- **WHEN** a show has two entries whose dogs lack a number for their trial's registry
- **THEN** the Exceptions list shows "Registration number needed" with a count of 2, and the pane lists both

#### Scenario: Resolving a row removes it

- **WHEN** the secretary adds the missing registration from a row
- **THEN** that entry leaves the pane and the count drops by one

#### Scenario: The pane is URL state

- **WHEN** the secretary opens the pane and copies the link or refreshes
- **THEN** the same pane reopens, like the other exception panes
