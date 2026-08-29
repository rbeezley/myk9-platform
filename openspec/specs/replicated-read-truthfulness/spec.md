## Purpose

Ensure local replicated-table reads can distinguish confirmed empty data from unreadable data, so show-day surfaces never present an unknown schedule as a factual empty or not-started state.

## Requirements

### Requirement: Replicated reads expose success and failure without breaking legacy callers

The replication package SHALL provide an additive all-rows read result that distinguishes a successful read, including a successful zero-row read, from an IndexedDB initialization, access, or timeout failure. A failed result SHALL retain the read error for downstream handling. The existing all-rows array API MUST keep its empty-array-on-failure compatibility behavior.

#### Scenario: Empty table is read successfully

- **WHEN** a replicated table is readable and contains no fresh rows
- **THEN** the status-bearing read reports success with an empty rows array and no error

#### Scenario: Local replica cannot be read

- **WHEN** IndexedDB initialization or access fails, or the all-rows read times out
- **THEN** the status-bearing read reports failure with an empty rows array and the failure error
- **AND** the existing array-only read still resolves to an empty array for compatibility

#### Scenario: Circuit-breaker bookkeeping is preserved

- **WHEN** a status-bearing all-rows read succeeds or fails
- **THEN** the existing database failure counter is respectively reset or incremented exactly as it is for the legacy all-rows read

#### Scenario: Filtered and transformed table contracts are preserved

- **WHEN** a caller requests a license-scoped status read or a replicated-table subclass redacts or transforms its public all-rows result
- **THEN** the successful status-bearing result applies the same filtering or transformation as the legacy public read

#### Scenario: Subscription refresh cannot emit a false empty snapshot

- **WHEN** a replicated-table subscription attempts to read its current snapshot and that read fails
- **THEN** the subscription does not invoke listeners with an empty array that is indistinguishable from a confirmed empty table
- **AND** a later successful notification still reaches active listeners

### Requirement: Show Desk schedule inputs preserve the last confirmed snapshot

The Trial store SHALL use status-bearing replicated reads for both Trial and Class data that feed the Show Desk schedule. It SHALL expose whether each read is idle, loading, ready, or failed, and whether each dataset has ever produced a confirmed snapshot, separately from mutation errors. A failed read MUST preserve the last successfully loaded data instead of replacing it with empty state.

#### Scenario: First schedule read succeeds with no rows

- **WHEN** the Trial and Class replicas are readable and contain no rows
- **THEN** each read state becomes ready and the store records the confirmed empty snapshot

#### Scenario: Refresh fails after a successful read

- **WHEN** Trial or Class data was loaded successfully and a later replicated read fails
- **THEN** the corresponding read state becomes failed with a retryable error
- **AND** the store retains the last successfully loaded Trial or Class snapshot

#### Scenario: Confirmed empty snapshot later fails to refresh

- **WHEN** a successful read confirmed an empty Trial or Class dataset and a later refresh fails
- **THEN** the store retains knowledge that a confirmed snapshot exists even though its rows remain empty

#### Scenario: Failed read later recovers

- **WHEN** a failed Trial or Class read is retried and succeeds
- **THEN** the store replaces the corresponding snapshot with the successful rows
- **AND** clears that read error and marks the read ready

### Requirement: Show Desk does not state an unread schedule as fact

The existing Show Desk SHALL use the Trial and Class read states before deriving schedule empty states, summaries, or lifecycle status. When a required read has failed and no previously confirmed schedule snapshot is available, the page MUST pause those claims, explain in calm plain language that the schedule could not be loaded, and provide a retry action. No new page, dialog, sheet, or duplicate schedule surface SHALL be introduced.

#### Scenario: Initial schedule read fails

- **WHEN** Show Desk has no previously confirmed Trial/Class schedule snapshot and either required replicated read fails
- **THEN** it does not render the class schedule, “No Classes” empty state, “No activity yet” summary, or “work has not started” status
- **AND** it shows an inline schedule-unavailable state with a retry action

#### Scenario: Schedule reads have not settled

- **WHEN** either required Trial/Class read is idle or loading and no confirmed schedule snapshot exists
- **THEN** Show Desk shows a loading state and does not derive schedule empty or lifecycle claims

#### Scenario: Previously loaded schedule refresh fails

- **WHEN** Show Desk has a previously confirmed schedule snapshot and a later Trial or Class refresh fails
- **THEN** it keeps the existing schedule visible
- **AND** identifies that the schedule could not be refreshed and offers retry without describing offline use itself as an error

#### Scenario: Retry succeeds

- **WHEN** the secretary activates retry and both required replicated reads succeed
- **THEN** Show Desk resumes deriving schedule and lifecycle claims from the newly confirmed snapshot
