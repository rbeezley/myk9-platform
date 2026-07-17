# inline-state-editing

## ADDED Requirements

### Requirement: Entry status is editable inline from its badge

The system SHALL make the entry status badge on Entry Management a direct edit affordance: activating it opens a popover of the frequent, eligible transitions resolved from the shared entity-action definitions, and selecting one dispatches the same mutation as the equivalent row-menu action. The badge visual SHALL be rendered by the shared status icon grammar; this capability owns only the edit behavior. Check-in badges SHALL retain their existing click-to-change behavior.

#### Scenario: Change status from the badge

- **WHEN** a secretary activates an entry's status badge and selects an eligible transition
- **THEN** the same replicated mutation fires as if chosen from the row action menu, and the badge reflects the new status

#### Scenario: Ineligible transitions are not offered

- **WHEN** the popover opens for an entry
- **THEN** only transitions whose eligibility predicate accepts that entry are offered

#### Scenario: Keyboard and touch accessibility

- **WHEN** the badge is reached by keyboard or touch on a tablet
- **THEN** it is operable as a real button with focusable popover items and touch targets meeting the established 44px minimum

### Requirement: Simple state changes offer a time-boxed undo

The system SHALL present a time-boxed undo affordance after simple single and bulk state changes. Undo SHALL dispatch the inverse transition through the same replication-backed mutation path used by the original change, using the recorded entry status history as the reference for the prior state, never as the revert mechanism, so the revert itself is recorded as a new history event.

#### Scenario: Undo a single status change

- **WHEN** a secretary accepts an entry and activates Undo within the time window
- **THEN** the inverse transition dispatches through the same replicated mutation seam and the entry returns to its prior status, recorded as a new history event

#### Scenario: Undo a bulk change reverts only the succeeded subset

- **WHEN** a bulk status change partially succeeded and the user activates Undo
- **THEN** only the items that succeeded are reverted, each with its own supersession check

#### Scenario: Undo window expires

- **WHEN** the undo window elapses without activation
- **THEN** the affordance is dismissed and the change stands

### Requirement: Undo is honest when it cannot be honored

The system SHALL NOT offer or execute an undo it cannot honor. Before reverting, the system SHALL verify the item's current state still equals the state produced by the original action; on mismatch it SHALL report that the item was changed by someone else and leave it untouched. When the original change is still queued offline, the system SHALL say so explicitly and only offer undo where the local queue guarantees ordering of the inverse operation.

#### Scenario: Superseded by another actor

- **WHEN** the user activates Undo but the entry's current status no longer matches the status the original action produced
- **THEN** no revert occurs and the user is told the entry was changed by someone else

#### Scenario: Offline-queued change

- **WHEN** a state change is made offline and its mutation is still queued locally
- **THEN** the feedback indicates the change is queued, and undo is either enqueued with guaranteed ordering behind the original or withheld with explicit messaging

### Requirement: Confirmation dialogs are removed only where undo covers the change

The system SHALL remove routine confirmation dialogs only for simple state transitions covered by the undo affordance, and SHALL retain dialogs for any action requiring a reason, note, or other complex input.

#### Scenario: Simple transition skips confirmation

- **WHEN** a secretary triggers a simple, undo-covered transition (e.g. accept an entry)
- **THEN** the change applies immediately with an undo affordance and no confirmation dialog

#### Scenario: Reason-collecting dialog is retained

- **WHEN** an action requires a reason or note (e.g. reject with reason, withdraw with refund)
- **THEN** the existing dialog flow is preserved
