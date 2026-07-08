## Purpose

Keep the secretary show-desk late-entry workflow usable at a venue with poor or no connectivity. A secretary must be able to capture a new exhibitor, a new dog, registration details, class selections, staff-recorded payment, and day-of entry rows entirely on-device, with sync completing later. This is a narrow, dependency-ordered offline extension of the existing late-entry wizard — not a new surface, not a broad offline people directory, and not offline card checkout.

## Requirements

### Requirement: Secretary Late-Entry Capture Works Without Connectivity
The system SHALL allow a secretary or administrator using the existing late-entry wizard to capture a new exhibitor, new dog, registration details, class selections, staff-recorded payment, and day-of entry rows without network connectivity.

#### Scenario: Offline new dog late entry is saved locally
- **WHEN** a secretary starts a show-desk late entry while offline, creates a new exhibitor, creates a new dog, selects eligible classes, records a non-card payment method, and submits the entry
- **THEN** the system creates local pending person, dog, registration-intent, and day-of entry records on the device without requiring a Supabase round trip

#### Scenario: Existing online registration remains unchanged
- **WHEN** an exhibitor or non-late-entry user submits a normal show registration
- **THEN** the system continues to use the existing online registration submission behavior

### Requirement: Offline Queue Replay Preserves Dependency Order
The system SHALL queue show-desk late-entry mutations so dependent records do not upload before their prerequisites.

#### Scenario: Dog waits for locally-created person
- **WHEN** a dog is created for a locally-created offline exhibitor
- **THEN** the dog insert mutation depends on the person insert mutation

#### Scenario: Entries wait for locally-created dog
- **WHEN** day-of entries are created for a locally-created offline dog
- **THEN** each entry insert mutation depends on the pending dog insert mutation

#### Scenario: Registration intent waits for dog resolution
- **WHEN** registration details are captured for a locally-created offline dog
- **THEN** the registration intent remains associated with the dog id until the dog can be uploaded or resolved after reconnect

### Requirement: Local Person Queue Is Narrow To Show-Desk Capture
The system SHALL provide only the local person persistence needed for show-desk late-entry capture and SHALL NOT introduce broad people-directory replication in this change.

#### Scenario: Local exhibitor id is preserved
- **WHEN** the secretary creates an exhibitor in offline-first late-entry mode
- **THEN** the local person record uses a stable client id that can be referenced by the dog and uploaded later

#### Scenario: People directory sync is not broadened
- **WHEN** the local show-desk people table is initialized for sync
- **THEN** it does not perform a broad people-table download for directory browsing or duplicate matching

### Requirement: Offline Dog Creation Is Scoped To Late Entry
The system SHALL use local-first dog creation only for secretary/admin late-entry mode unless another caller explicitly opts in.

#### Scenario: Late-entry dog creation is local-first
- **WHEN** the quick-create dog flow is used from secretary/admin late-entry mode
- **THEN** the dog is created through the replication-backed offline-first dog path

#### Scenario: Normal dog creation path is preserved
- **WHEN** a dog is created outside offline-first late-entry mode
- **THEN** the existing online-compatible dog creation path remains available and unchanged

### Requirement: Staff-Recorded Late-Entry Payment Uses Offline Entry Submission
The system SHALL route secretary/admin late-entry submissions with staff-recorded non-card payment methods through replicated day-of entry creation.

#### Scenario: Cash or check late entry creates replicated entries
- **WHEN** a secretary submits a late entry with a cash, check, waived, or other staff-recorded payment method
- **THEN** the system creates one replicated day-of entry per selected class with confirmed entry status, day-of-show metadata, payment metadata, armband assignment, and queued sync state

#### Scenario: Offline card checkout is not attempted
- **WHEN** a secretary late-entry submission selects credit-card payment while offline or in a staff-recorded offline path
- **THEN** the system does not attempt offline card checkout and keeps the existing card guard behavior

### Requirement: Offline State Language Is Calm
The system SHALL treat no-connectivity late-entry capture as normal local saving and SHALL avoid scary failure language for successfully captured local work.

#### Scenario: Local work is acknowledged without network-error language
- **WHEN** a secretary saves an offline late entry successfully on the device
- **THEN** the system reports or exposes state as saved locally, finishing save, pending registration attach, or needs attention only when actual review is required

### Requirement: Focused Verification Covers Offline And Existing Paths
The implementation SHALL include focused tests for queue lookup, local people creation, dependency-aware dog creation, pending registration persistence, late-entry quick-create routing, offline entry submission, and unchanged existing online behavior.

#### Scenario: Focused tests prove the no-connectivity path
- **WHEN** the focused test suite for this change runs
- **THEN** it verifies that the secretary can complete the offline new-dog late-entry path without direct Supabase writes in the critical flow
