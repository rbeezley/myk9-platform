## ADDED Requirements

### Requirement: Wizard steps use a single scroll context at narrow widths

At phone widths, a registration wizard step SHALL NOT place a fixed-height inner scroll region inside the page scroll. The step's content SHALL flow in one scroll context so every option and the step's navigation controls are reachable by a single continuous scroll gesture. Inner scroll regions MAY be used at tablet width and above.

#### Scenario: Dog selection at phone width

- **WHEN** the dog-selection step renders at 390×844 with more dogs than fit on screen
- **THEN** the page presents one scroll context containing all dogs and the step navigation
- **AND** no nested scrollable region with its own scrollbar is present within the step content

#### Scenario: Inner scroll retained on larger viewports

- **WHEN** the same step renders at 1280px width
- **THEN** the existing constrained-height presentation may be retained

### Requirement: Class levels carry eligibility guidance before money is committed

The class-selection step SHALL give the exhibitor enough information to avoid selecting a level their dog is not eligible for. Levels the dog has not qualified for SHALL be visually distinguished, or the step SHALL display plain-language guidance naming the entry-level starting point.

#### Scenario: New dog with no titles views available levels

- **WHEN** a dog with no recorded titles is selected and the class list renders advanced levels alongside novice levels
- **THEN** the step conveys which levels are appropriate starting points, in plain language, without requiring outside knowledge of the sport

#### Scenario: Guidance appears before payment

- **WHEN** eligibility guidance is shown
- **THEN** it is presented on the class-selection step, before the payment step is reached

### Requirement: Prerequisite warnings are actionable

A warning about a missing prerequisite on a dog SHALL provide a control that resolves it for that dog, or SHALL state exactly what the exhibitor must do and where. A warning SHALL NOT instruct the exhibitor to act without providing the means to act.

#### Scenario: Dog without a registration on file

- **WHEN** the dog-selection step warns that a selected dog has no registration on file
- **THEN** the warning provides a control to add a registration for that dog, or names the exact surface where it can be added

#### Scenario: Warning accuracy is preserved

- **WHEN** a dog does have a registration on file
- **THEN** no missing-registration warning is shown for that dog

### Requirement: Registration status reflects that registration is required to compete

A dog must be registered with the sanctioning organization to be entered, with the sole exception of puppy classes in conformation. The wizard SHALL therefore present a missing registration for the entered organization as a blocking prerequisite rather than an advisory note, except where the selected class falls under that exception, in which case it SHALL explain why entry is still permitted.

#### Scenario: Unregistered dog entering a class that requires registration

- **WHEN** an exhibitor selects a dog with no registration for the sanctioning organization and a class that requires registration
- **THEN** the wizard states that registration is required before the entry can be accepted
- **AND** it provides the path to add that registration

#### Scenario: Puppy conformation exception

- **WHEN** the selected class is a conformation puppy class that does not require registration
- **THEN** the wizard permits the entry
- **AND** it states why registration is not required for that class

#### Scenario: Registration for a different organization

- **WHEN** a dog holds a registration with an organization other than the one sanctioning the show
- **THEN** the wizard does not treat that as satisfying the requirement for the sanctioning organization

### Requirement: Payment reassurance is stated once

The payment step SHALL state the checkout-and-confirmation reassurance once, positioned with the control it describes. It SHALL NOT repeat the same statement verbatim, nor restate it in near-identical alternative wording, elsewhere on the same step.

#### Scenario: Payment step renders its reassurance

- **WHEN** the payment step renders
- **THEN** the statement describing secure checkout and entry confirmation appears exactly once

#### Scenario: Blocking conditions remain explained

- **WHEN** the submit control is disabled pending agreement acceptance
- **THEN** the reason remains visibly stated next to the control
