## ADDED Requirements

### Requirement: The commit control agrees with the selected payment method

The label of the control that commits the entry SHALL describe the same action the selected payment method's own description gives. For a method paid at the show, the label SHALL say the payment is brought to the show, never mailed.

#### Scenario: Check selected

- **WHEN** the exhibitor selects the check payment method whose description says to bring the check to the show
- **THEN** the commit control's label says the check is brought to the show and does not say "mail"

#### Scenario: Card selected

- **WHEN** card is selected
- **THEN** the commit control's label says the entry is submitted and paid

### Requirement: Payment-method options do not use a selection glyph as their icon

A payment-method option SHALL NOT use a check mark, tick or "selected" glyph as its identifying icon; the selected state SHALL be conveyed only by the option's selection control.

#### Scenario: Check option unselected

- **WHEN** the payment step renders with card selected
- **THEN** the check option shows no check-mark glyph anywhere except an unselected selection control

### Requirement: Removing a fee line on the payment step requires confirmation

On the payment step, removing a class from the entry SHALL require a confirmation naming the class before the removal is performed. Cancelling SHALL leave the entry unchanged.

#### Scenario: Remove then cancel

- **WHEN** the exhibitor activates remove on a fee line and cancels the confirmation
- **THEN** the line and the total are unchanged

#### Scenario: Remove then confirm

- **WHEN** the exhibitor confirms the removal
- **THEN** the line is gone and the totals are recomputed
