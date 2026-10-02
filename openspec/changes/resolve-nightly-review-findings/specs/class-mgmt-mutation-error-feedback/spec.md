# Spec Delta

## ADDED Requirements

### Requirement: Shared class edit rejects required judge failure

The shared class editor SHALL reject a required judge-assignment preparation failure before reporting Saved, retain edits and keep the editor open. A cache refresh failure after successful write preparation SHALL remain best-effort.

#### Scenario: Judge preparation fails

- **WHEN** a changed judge cannot be prepared or queued in Setup or Class Details
- **THEN** the editor shows a truthful error, remains open with the edited judge, and displays no success confirmation

#### Scenario: Cache refresh fails after successful preparation

- **WHEN** judge preparation and class write succeed but background cache refresh fails
- **THEN** the successful write is retained and is not misrepresented as an unsaved failure
