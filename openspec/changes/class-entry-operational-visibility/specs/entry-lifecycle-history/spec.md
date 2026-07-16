## ADDED Requirements

### Requirement: Authorized staff can inspect entry status history
The existing staff entry-detail workflow SHALL provide a read-only entry status history showing each authoritative lifecycle transition's previous status, new status, actor when available, timestamp, and reason when available. The history SHALL use the generated `entry_status_history` schema fields.

#### Scenario: Entry has multiple status transitions
- **WHEN** authorized staff opens history for an entry with multiple `entry_status_history` rows
- **THEN** the timeline displays the transitions in a consistent chronological order
- **AND** each row maps `previous_status` and `new_status` without reading a non-schema `status` property

#### Scenario: Actor or reason is absent
- **WHEN** a history row has no actor or reason
- **THEN** the timeline uses calm fallback copy without inventing a person or explanation

#### Scenario: Entry has no recorded history rows
- **WHEN** an authorized staff user opens history for an entry with no status-history rows
- **THEN** the timeline shows an honest created/current-state fallback if authoritative entry timestamps are available
- **AND** it does not fabricate intermediate transitions

### Requirement: History remains inside an existing owner surface
Entry status history SHALL be reachable from the existing staff entry-detail/edit workflow and SHALL NOT create a standalone history route, class command center, or second Entry Management page.

#### Scenario: Secretary opens history from an entry
- **WHEN** a secretary chooses to inspect an entry's history from the existing entry workflow
- **THEN** history appears within that workflow
- **AND** closing history returns the secretary to the same entry context and filters

### Requirement: History authorization follows show access
The system SHALL request and render entry status history only for authenticated staff authorized to access the entry's show, with database RLS remaining the final authorization boundary.

#### Scenario: Unauthorized user requests entry history
- **WHEN** a user without staff access to the entry's show attempts to read its history
- **THEN** no history rows are returned or rendered

#### Scenario: Exhibitor views public class details
- **WHEN** an exhibitor or anonymous visitor views an entry or class result surface
- **THEN** the staff status-history control is not rendered

### Requirement: History failures do not block core entry work
Entry status history SHALL load as a secondary read and SHALL NOT block the entry list, class run sheet, status actions, check-in, or scoring workflows.

#### Scenario: History query fails
- **WHEN** the history read fails while the core entry data is available
- **THEN** the existing entry workflow remains usable
- **AND** the history area shows a scoped plain-language retry state

#### Scenario: First-time history access occurs offline
- **WHEN** staff opens history without a cached result while offline
- **THEN** the history area quietly explains that history is available when connected
- **AND** connectivity loss is not presented as a core entry error

#### Scenario: Cached history exists when offline
- **WHEN** staff previously loaded history and later opens it while offline
- **THEN** the cached history may remain visible with a quiet freshness indication

