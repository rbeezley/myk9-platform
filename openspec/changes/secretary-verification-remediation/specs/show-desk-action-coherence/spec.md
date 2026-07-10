## ADDED Requirements

### Requirement: Show Desk actions keep same-page entry data fresh

Entry mutations executed from the Show Desk (check-in, scratch/no-show, move-up, approve) SHALL update or invalidate every React Query cache that feeds the Show Desk page itself, so counts, the People roster, and entry pickers reflect the action without a manual refetch.

#### Scenario: Check-in updates same-page counts

- **WHEN** a secretary checks in an entry from the Show Desk
- **THEN** the entries query backing the Show Desk page is optimistically patched or invalidated, and displayed class counts and the People roster reflect the check-in without remount or manual retry

#### Scenario: One canonical entries query key

- **WHEN** the Show Desk page and Show Details page fetch secretary entries for a show
- **THEN** they use the same canonical query key that the show-map action executor patches, so no second independently named cache of the same data exists

### Requirement: Scratch and no-show actions are undoable

Scratching or marking an entry as a no-show from the Show Desk SHALL capture the entry's previous status, check-in state, and notes, and SHALL offer a time-boxed undo affordance that restores them, mirroring the move-up undo pattern.

#### Scenario: Undo a scratch

- **WHEN** a secretary scratches an entry from the Show Desk and activates the undo affordance in the confirmation toast
- **THEN** the entry's prior status, check-in state, and notes are restored via replicated (offline-safe) writes

#### Scenario: Undo unavailable after toast dismissal

- **WHEN** the scratch confirmation toast expires or is dismissed
- **THEN** the scratch remains applied and recovery follows the standard Entry Management status-change path
