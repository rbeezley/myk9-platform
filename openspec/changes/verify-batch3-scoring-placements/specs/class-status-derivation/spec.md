## ADDED Requirements

### Requirement: Fully accounted manual classes receive canonical placements

The server SHALL calculate canonical placements for a manual class with at least one expected entry and all expected entries accounted for. It SHALL preserve manual status, finalization and class times, and SHALL NOT rank an incomplete or empty manual class.

#### Scenario: Manual completion precedes final scoring

- **WHEN** a manual class receives its last expected score
- **THEN** qualified entries receive canonical placements while class status and manual source remain unchanged

#### Scenario: A score correction updates manual-class ranks

- **WHEN** a score changes in a fully accounted manual class
- **THEN** placements are recalculated from canonical ranking keys

#### Scenario: Incomplete manual class retains its state

- **WHEN** a manual class has an expected unaccounted entry or no expected entries
- **THEN** no new placements are calculated and its manual status remains unchanged

#### Scenario: Existing manual classes are reconciled

- **WHEN** the placement migration refreshes a fully accounted manual class
- **THEN** it supplies canonical ranks while preserving manual status and suppressing class-status push notifications
