# admin-system-health

## ADDED Requirements

### Requirement: A scheduled check-runner writes daily snapshots

The system SHALL run a server-side, `service_role` job at least once per day that executes the
recurring, machine-checkable health checks and `INSERT`s exactly one row into
`public.system_health_snapshots` per run. The row SHALL satisfy the store contract: a `source` string,
an `overall_status` in `'ok' | 'warn' | 'fail'` equal to the worst of the individual check statuses, a
`checks` array of `{key, label, status, detail, checked_at}` objects, and an optional `run_duration_ms`.
The job cadence SHALL be shorter than the board's staleness threshold (~26h) so a healthy run is never
flagged stale.

#### Scenario: A healthy run writes an ok snapshot

- **WHEN** every check evaluates to `ok`
- **THEN** the inserted row has `overall_status = 'ok'` and a `checks` array with one entry per check

#### Scenario: overall_status is the worst check status

- **WHEN** at least one check is `fail` (or, absent any `fail`, at least one is `warn`)
- **THEN** the inserted row's `overall_status` is `fail` (respectively `warn`)

#### Scenario: The job runs within the staleness window

- **WHEN** the scheduler fires the job on its daily cadence
- **THEN** a new snapshot is written less than ~26 hours after the previous one, so the board does not
  flag the latest run as stale while the job is healthy

### Requirement: Privileged health facts are gathered by a service-role-only probe

The system SHALL expose the health facts that are unreachable through PostgREST — scheduled cron jobs
and their latest run outcome, and the newest applied migration — via a single `SECURITY DEFINER` SQL
function `public.system_health_probe()`. Execution SHALL be granted to `service_role` only; `public`,
`anon`, and `authenticated` SHALL NOT be able to execute it. The function SHALL only read (no
mutation) and SHALL return a JSON facts object.

#### Scenario: The runner reads facts as service_role

- **WHEN** the check-runner invokes `system_health_probe()` as `service_role`
- **THEN** it receives a JSON object containing the cron jobs with their last-run status and the newest
  applied migration version

#### Scenario: Non-service roles cannot execute the probe

- **WHEN** an `anon` or `authenticated` client attempts to execute `system_health_probe()`
- **THEN** execution is denied (no grant)

### Requirement: Automated launch-morning checks

The check-runner SHALL evaluate at least these read-only checks each run, mapping runbook Phase 5
items:

- `payout_cron` (runbook 5.4): the nightly payout cron job SHALL be scheduled and active, and its
  latest run SHALL have succeeded within the staleness window. A missing/inactive job or a failed last
  run SHALL be `fail`; a never-run or overdue job SHALL be `warn`; otherwise `ok`.
- `background_jobs`: every other scheduled cron job's latest run SHALL be healthy; any failed last run
  SHALL be `fail`; any never-run/overdue SHALL be `warn`; otherwise `ok`.
- `migrations` (runbook 5.2 proxy): the newest applied migration version SHALL be reported; a missing
  version SHALL be `warn`; otherwise `ok`. This reports newest-applied only, not full local↔remote
  parity.

For a cron job whose command dispatches an Edge Function via `net.http_post`, a healthy status SHALL be
worded as "dispatched" rather than implying the Edge Function returned a 2xx response — because pg_cron
records `succeeded` once the request is enqueued and never observes the downstream HTTP outcome. The
runner SHALL surface whether a job dispatches HTTP (from its command) and word the check accordingly;
verifying the downstream HTTP response is explicitly out of scope for this check and belongs to a
per-function ledger.

#### Scenario: An http-dispatch job's green status is worded as "dispatched"

- **WHEN** a `net.http_post` cron job's most recent run status is `succeeded`
- **THEN** the check is `ok` and its detail states the run was dispatched and the Edge Function response
  was not checked here — it does not claim the function returned 2xx

#### Scenario: A scheduler-body error is still caught

- **WHEN** a cron job's `DO` block raises before dispatching (e.g. a missing Vault secret), so pg_cron
  records `failed`
- **THEN** the corresponding check is `fail`

#### Scenario: A failed payout cron surfaces as fail

- **WHEN** the `nightly-show-payouts` job's most recent run status is `failed`
- **THEN** the `payout_cron` check is `fail` and the run's `overall_status` is `fail`

#### Scenario: A stale payout cron surfaces as warn

- **WHEN** the `nightly-show-payouts` job is scheduled and active but its last run is older than the
  staleness window
- **THEN** the `payout_cron` check is `warn`

### Requirement: A probe failure is written as a visible failure, not a silent skip

If the health facts cannot be gathered (the probe errors or returns nothing), the check-runner SHALL
still `INSERT` a snapshot with `overall_status = 'fail'` carrying a check that records the failure,
rather than writing nothing. This ensures an infrastructure outage surfaces on the board rather than
appearing as an aging (eventually stale) run.

#### Scenario: Probe error still produces a snapshot

- **WHEN** `system_health_probe()` raises an error or returns no facts
- **THEN** the runner inserts a snapshot whose `overall_status` is `fail` and whose `checks` include an
  entry describing the probe failure
