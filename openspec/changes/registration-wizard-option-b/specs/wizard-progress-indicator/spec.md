## Purpose

Step navigation for multi-step wizards that reads as a single row of numbered steps, never breaks a step title mid-word, and keeps step state available to assistive technology at every viewport.

## ADDED Requirements

### Requirement: Each step shows one single-line title and no secondary text

A wizard step indicator SHALL render exactly one text label per step, on a single line. It SHALL NOT render a step description, and it SHALL NOT render a textual status word ("Done", "Current", "Upcoming") beside the title. Step state SHALL be conveyed by the step marker (completed check, current ring, upcoming number) and by the accessibility attributes in the next requirement.

#### Scenario: Registration wizard titles

- **WHEN** the registration wizard renders for an exhibitor
- **THEN** the indicator shows the titles `Select dogs`, `Select classes`, `Payment`, `Receipt` and nothing else as text per step

#### Scenario: Staff variant title

- **WHEN** the registration wizard renders on the secretary route
- **THEN** the indicator shows `Handlers` as the third title between `Select classes` and `Payment`

#### Scenario: Show-creation wizard keeps its titles

- **WHEN** the show-creation wizard renders
- **THEN** each step shows its existing title only, with no description line

### Requirement: A step title never breaks inside a word

At any viewport width from 320px up, in the four-step and five-step variants, a step title SHALL occupy one rendered line. When the available width is narrower than the title, the title SHALL be truncated with an ellipsis and its full text SHALL remain available through the step's accessible name. A title SHALL NOT wrap onto a second line and SHALL NOT be split between characters of a word.

#### Scenario: Single-row widths with the five-step variant

- **WHEN** the five-step variant renders at 1024px, 1100px, 1280px and 1440px
- **THEN** every title has exactly one rendered line box and every rendered line's text is a prefix of the title cut at a whole word or ends with an ellipsis

#### Scenario: Phone width with the four-step variant

- **WHEN** the four-step variant renders at 390px
- **THEN** every title has exactly one rendered line box and none is split inside a word

### Requirement: Step state stays available to assistive technology

The current step SHALL carry `aria-current="step"`. Each step's accessible name SHALL be its title followed by ` (completed)` for completed steps and ` (current)` for the current step. The indicator SHALL expose overall progress as a progressbar whose value is the number of completed steps.

#### Scenario: Screen reader reads the current step

- **WHEN** the second step is current and the first is complete
- **THEN** the first step's accessible name ends with `(completed)`, the second's ends with `(current)` and carries `aria-current="step"`, and the progressbar reports 1 of N complete

### Requirement: Completed steps are the only navigable ones

A completed step and the first incomplete step SHALL be activatable to navigate; later steps SHALL be disabled. Activating a step SHALL not be possible from the connector or the marker alone; the whole step is one target of at least 44px height.

#### Scenario: Skipping ahead is not possible

- **WHEN** the exhibitor is on step 1 with no steps complete
- **THEN** steps 2 through N are disabled and step 1 is the only activatable step
