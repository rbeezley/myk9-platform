## Purpose

Make existing club show cards predictable for keyboard, screen-reader, and touch users by separating show navigation from the card's action menu.

## ADDED Requirements

### Requirement: Show card actions are independently operable

Each club show card action trigger SHALL have a show-specific accessible name, meet the 44px minimum touch-target convention, and stop pointer and keyboard activation from triggering parent-card navigation.

#### Scenario: Keyboard opens the action menu

- **WHEN** a user focuses the show action trigger and presses Enter or Space
- **THEN** the existing action menu opens without navigating away
- **AND** Escape closes the menu and returns focus to its trigger

#### Scenario: Menu and card destinations remain correct

- **WHEN** a user activates a menu item or directly activates the card
- **THEN** the menu item follows its existing destination and direct card activation opens that show

#### Scenario: Same-pattern club show cards are consistent

- **WHEN** Upcoming Shows and Past Shows render equivalent show action controls
- **THEN** both call sites follow the same accessible naming, target-size, and event-boundary behavior
