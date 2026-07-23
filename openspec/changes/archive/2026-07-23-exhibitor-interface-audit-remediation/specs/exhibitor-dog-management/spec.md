# Delta: exhibitor-dog-management

## ADDED Requirements

### Requirement: My Dogs is card-only for exhibitors

For exhibitor-only users, the My Dogs page SHALL render the card grid exclusively: no table view and no view-mode toggle. Secretary and admin dog lists SHALL retain their table view and toggle unchanged.

#### Scenario: Exhibitor sees no toggle

- **WHEN** an exhibitor-only user opens `/dogs`
- **THEN** dogs render as cards and no grid/table view toggle is present in the toolbar

#### Scenario: Secretary retains table

- **WHEN** a secretary opens the dog list
- **THEN** the table view and view toggle behave exactly as before this change

### Requirement: Dog card click is the single navigation affordance

Dog cards SHALL NOT render a separate "View" button; the card itself SHALL navigate to the dog detail page on click and on Enter, exposing `role="link"` and keyboard focusability.

#### Scenario: No View button, card navigates

- **WHEN** an exhibitor activates a dog card by click or Enter key
- **THEN** the app navigates to `/dogs/:id`, and no "View Dog" button exists on the card

### Requirement: Dog Details tab strip fits without Activity tab

The Dog Details page SHALL NOT include Activity in the tab strip; activity content SHALL render as a titled section below the tab panel, and the default selected tab SHALL be Registrations.

#### Scenario: Activity rendered below tabs

- **WHEN** an exhibitor opens a dog's detail page
- **THEN** the tab strip omits Activity, Registrations is selected by default, and the activity feed appears as a section beneath the tab content

### Requirement: Upgrade teaser navigates to pricing

The "Upgrade to unlock" button in the Title Progress teaser SHALL navigate to `/pricing-page`, the same destination as the existing locked-tab upgrade action.

#### Scenario: Teaser button works

- **WHEN** a non-premium exhibitor clicks "Upgrade to unlock" in the dog detail sidebar
- **THEN** the app navigates to `/pricing-page`

### Requirement: Add-a-Dog wizard field placement

The Add-a-Dog wizard SHALL NOT render a hint under the Date of Birth field, and the "Color & Markings" field SHALL live on the Optional details tab, not Essentials. Wizard validation SHALL move with the field so Essentials completes without it.

#### Scenario: DOB has no hint

- **WHEN** the Essentials step renders
- **THEN** the Date of Birth field shows no approximate-date hint text (the live age preview remains)

#### Scenario: Color moved to Optional details

- **WHEN** a user completes the Essentials step without entering color
- **THEN** the step validates, and the "Color & Markings" field is available on the Optional details tab

### Requirement: Wizard registration entry uses a slide-out panel

Adding a registration from within the Add-a-Dog wizard SHALL use the app's slide-out panel pattern rather than a pop-up dialog, writing to wizard state (the dog is not yet persisted). Save/cancel semantics SHALL be unchanged.

#### Scenario: Registration opens as slide-out

- **WHEN** a user adds a registration inside the Add-a-Dog wizard
- **THEN** the form opens as a slide-out panel layered above the wizard, and saving adds the registration to the wizard's pending dog

### Requirement: Photo dialog is readable in both themes

The dog photo upload dialog SHALL use theme tokens/standard button variants (no hardcoded gray/blue utility colors), so the Save button and helper text meet contrast in light and dark mode.

#### Scenario: Save button visible in dark mode

- **WHEN** the photo dialog opens in dark mode with an image selected
- **THEN** the Save button renders with the standard default Button variant styling and its label is clearly readable
