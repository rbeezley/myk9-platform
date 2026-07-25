## ADDED Requirements

### Requirement: Show-day changes emit a minimal show-scoped signal

The database SHALL emit one private `showday_change` Broadcast signal for every committed insert, update, or delete on `entries` or `classes`. The topic SHALL identify the affected show, and the payload MUST NOT contain row identifiers or row values.

#### Scenario: Entry change is routed to its show

- **WHEN** an entry row is inserted, updated, or deleted
- **THEN** the database emits a signal on `show:<entry show id>:changes` whose payload identifies only `entries`

#### Scenario: Class change is routed through its trial

- **WHEN** a class row is inserted, updated, or deleted
- **THEN** the database resolves the trial's show and emits a signal on `show:<trial show id>:changes` whose payload identifies only `classes`

#### Scenario: Change moves between show scopes

- **WHEN** an entry's show or a class's trial/show scope changes
- **THEN** the database emits one signal to each distinct old and new show topic

#### Scenario: Signal delivery fails

- **WHEN** Realtime authorization, message insertion, or another Broadcast operation fails inside the trigger
- **THEN** the originating entry or class write still commits and the failure is available in database warnings or logs

### Requirement: Broadcast never becomes a data authority

Clients SHALL treat a Broadcast signal only as a request to synchronize or refetch through the existing replication-backed table or authorized query for that surface.

#### Scenario: Live signal reaches an offline-first surface

- **WHEN** an at-show or in-show surface receives a `showday_change` signal
- **THEN** it triggers its existing replication sync or refresh path without writing Broadcast payload data into the local replica

#### Scenario: Notification signal requires authoritative state

- **WHEN** the notification monitor receives a `showday_change` signal
- **THEN** it refetches its authorized snapshot before deciding whether to deliver dogs-ahead, class-starting, check-in, or results notifications

### Requirement: One transport channel serves all mounted consumers for a show

The client SHALL maintain at most one private Broadcast channel per show and SHALL fan each signal out to every registered in-process consumer.

#### Scenario: Multiple consumers register for one show

- **WHEN** two or more mounted hooks subscribe to the same show
- **THEN** the client opens one Supabase channel and invokes every registered callback for each signal

#### Scenario: Last consumer unmounts

- **WHEN** the final consumer for a show unsubscribes
- **THEN** the client removes the Supabase channel and releases the registry entry

#### Scenario: Consumer re-subscribes during cleanup

- **WHEN** a new consumer registers while removal of the previous channel is still settling
- **THEN** cleanup of the old generation does not remove or disconnect the new generation

### Requirement: Loss of live delivery does not break correctness

Every converted consumer SHALL retain its existing periodic polling, reconnect, foreground, manual refresh, or query refetch fallback as applicable.

#### Scenario: Broadcast is unavailable

- **WHEN** the private channel cannot subscribe or disconnects
- **THEN** the surface continues converging through its pre-existing non-Realtime fallback without treating the outage as a fatal error

#### Scenario: A burst arrives during refresh

- **WHEN** multiple signals arrive before or during an authoritative refresh
- **THEN** the consumer coalesces them and performs no more than one trailing refresh needed to observe the final state

### Requirement: Postgres Changes publication contains only surviving consumers

The migration SHALL remove `entries`, `classes`, and `show_message_threads` from `supabase_realtime` only after reachable client code no longer depends on their Postgres Changes events. It SHALL leave `shows`, `show_announcements`, and `show_messages` published.

#### Scenario: Publication migration completes

- **WHEN** the migration is applied
- **THEN** `supabase_realtime` excludes `entries`, `classes`, and `show_message_threads` while retaining the three tables with surviving Postgres Changes consumers

#### Scenario: Dead realtime plumbing is audited

- **WHEN** the implementation is verified
- **THEN** zero-consumer entry/class Realtime hooks, managers, and generic helpers are removed rather than preserved as a second transport path

### Requirement: Private signal authorization preserves row confidentiality

Anonymous and authenticated clients SHALL be able to join only the private show-change topic shape, and the signal SHALL reveal no entry or class row data.

#### Scenario: Authorized Realtime role joins a show-change topic

- **WHEN** an `anon` or `authenticated` client joins a topic matching `show:<uuid>:changes`
- **THEN** Realtime authorizes the SELECT subscription and delivers only minimal table-name signals

#### Scenario: Client joins an unrelated private topic

- **WHEN** a client attempts to use the show-change policy for a topic outside the required shape
- **THEN** the policy does not authorize that subscription
