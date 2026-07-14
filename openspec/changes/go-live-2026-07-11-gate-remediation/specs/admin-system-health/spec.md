## ADDED Requirements

### Requirement: Daily health delivery is independently verified

The system SHALL distinguish a queued asynchronous health request from a completed snapshot write. A database watchdog scheduled after the expected daily snapshot window SHALL query the latest indexed snapshot timestamp without calling the health Edge Function or using `pg_net`, and SHALL treat a missing expected UTC run as a failure. A separately configured external cron monitor SHALL notify a named human when the daily check-in is missed and again when it recovers.

#### Scenario: Queued request does not imply delivery

- **WHEN** `pg_cron` successfully queues the daily `net.http_post` request but no snapshot is written in the expected window
- **THEN** the health board remains stale, the database watchdog records the miss, and the external monitor reports the missed check-in

#### Scenario: Healthy delivery writes a fresh snapshot

- **WHEN** the daily health function completes successfully
- **THEN** exactly one fresh snapshot is visible before the watchdog window and no unresolved missed-run alert is created

#### Scenario: Independent paths fail separately

- **WHEN** either the database watchdog or external heartbeat path is simulated as failed
- **THEN** verification demonstrates that the other path remains independently observable

#### Scenario: [ADDED] External check-in delivery fails after snapshot success

- **WHEN** the health runner writes a fresh snapshot but its external monitor check-in fails
- **THEN** the snapshot remains committed and the external monitor independently reports the missing check-in

### Requirement: Health repair preserves failure visibility

The health scheduler and runner SHALL NOT swallow configuration or delivery failures as healthy outcomes. A probe failure SHALL continue to produce a visible failed snapshot when the runner is reached, while a delivery failure that prevents the runner from being reached SHALL remain visible as staleness and a missed-run alert.

#### Scenario: Runner receives a probe error

- **WHEN** the Edge Function runs but its privileged probe fails
- **THEN** it writes a failed snapshot rather than skipping the insert

#### Scenario: Runner is never reached

- **WHEN** the scheduled request fails before the Edge Function executes
- **THEN** no synthetic healthy snapshot is written and the independent missed-run paths surface the failure
