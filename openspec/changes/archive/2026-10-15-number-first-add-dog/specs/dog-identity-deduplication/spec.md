# Spec Delta

## ADDED Requirements

### Requirement: Add Dog starts with the registry identity

The Add Dog form SHALL ask for registry organization and registration number before any other dog detail. It SHALL look up that identity before the user continues, using normalized comparison. While offline it SHALL check the dogs available on the device. While online it SHALL also check the server.

#### Scenario: An existing dog is found first

- **WHEN** a secretary enters a registry and number that belong to a live dog
- **THEN** the form shows that dog by call name and offers to use it before asking for any other detail, and choosing it creates no new dog

#### Scenario: No match continues with the number filled in

- **WHEN** the entered registry identity matches no live dog
- **THEN** the form continues to the dog's details with that registration already recorded as the dog's first registration

#### Scenario: Offline lookup uses what the device holds

- **WHEN** the device is offline
- **THEN** the lookup checks the dogs on the device, does not wait on the network, and lets the user continue when there is no local match

### Requirement: A foreign-owner match reveals nothing

When the entered registry identity belongs to a live dog the user cannot see, the system SHALL tell the user only that the number is already registered to another dog and to contact the show secretary. The server lookup SHALL return whether the identity is taken and nothing else: no dog, owner or registration details.

#### Scenario: Exhibitor enters another owner's number

- **WHEN** an exhibitor enters a registry and number that belong to a dog owned by someone else
- **THEN** the form says the number is already registered to another dog and to contact the show secretary, shows no name, owner or details, and does not create the dog

#### Scenario: Lookup response carries no identity data

- **WHEN** any caller asks the server whether a registry identity is taken
- **THEN** the response is a yes or no answer only

### Requirement: Only secretaries may add a dog with no registration

The Add Dog form SHALL offer "No registration number yet" only to users who manage shows (secretary, club admin, site admin). That path skips the lookup and creates a dog with no registration. Exhibitors SHALL always start with a registration.

#### Scenario: Secretary skips the number

- **WHEN** a secretary chooses "No registration number yet"
- **THEN** the form continues to the dog's details with no registration recorded

#### Scenario: Exhibitor has no skip

- **WHEN** an exhibitor opens Add Dog
- **THEN** no "No registration number yet" option is shown, and the registration step must be completed to continue
