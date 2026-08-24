# admin-system-health

## Purpose

Defines the site-admin System Health board and its backing snapshot store: a durable, RLS-protected record of daily server-side health-check runs surfaced at `/admin/health` so an operator sees overall status, per-check freshness, and stale/missing-run failure signals at a glance — automating the recurring parts of the go-live runbook Phase 5 parity checklist. Introduced by the `admin-system-health-board` change; the daily check-runner that writes snapshots is a companion capability. Intentionally shaped as the same family as the planned `operator_alerts` table so they can converge later.

## Requirements

### Requirement: Snapshot store schema and access control

The system SHALL persist server-side health-check runs in a `public.system_health_snapshots` table with columns: `id` (uuid PK), `created_at` (timestamptz, default now), `source` (text, not null), `overall_status` (text, not null, constrained to `'ok' | 'warn' | 'fail'`), `checks` (jsonb, not null — an array of `{key, label, status, detail, checked_at}` objects, its array shape enforced by a `jsonb_typeof(checks) = 'array'` CHECK), and `run_duration_ms` (integer, nullable). The table SHALL have an index on `created_at desc`.

Access SHALL be governed by explicit GRANTs and Row Level Security: `authenticated` roles MAY `SELECT` only when `is_site_admin()` returns true; `service_role` MAY `INSERT`; `anon` SHALL have no access.

#### Scenario: A site admin reads snapshots

- **WHEN** a `authenticated` user for whom `is_site_admin()` is true queries `system_health_snapshots`
- **THEN** the query returns rows

#### Scenario: A non-admin authenticated user is denied

- **WHEN** an `authenticated` user for whom `is_site_admin()` is false queries `system_health_snapshots`
- **THEN** RLS returns zero rows

#### Scenario: Anonymous access is denied

- **WHEN** an `anon` client attempts to read `system_health_snapshots`
- **THEN** the request is rejected (no grant)

#### Scenario: overall_status is constrained

- **WHEN** an insert supplies an `overall_status` outside `'ok' | 'warn' | 'fail'`
- **THEN** the CHECK constraint rejects the row

#### Scenario: checks must be a JSON array

- **WHEN** an insert supplies a `checks` value that is not a JSON array (e.g. an object)
- **THEN** the `jsonb_typeof(checks) = 'array'` CHECK rejects the write

### Requirement: Status derivation from a snapshot

The system SHALL provide a pure function that derives the board's effective status from a snapshot and the current time. The effective status SHALL be `fail` when the snapshot is missing (empty table) or stale; otherwise it SHALL equal the snapshot's `overall_status`. A snapshot SHALL be considered stale when its `created_at` is older than the staleness threshold (~26 hours) relative to the current time.

#### Scenario: Fresh ok snapshot

- **WHEN** the latest snapshot has `overall_status = 'ok'` and `created_at` within the last 26 hours
- **THEN** the derived effective status is `ok` and not flagged stale

#### Scenario: Stale snapshot is a failure signal

- **WHEN** the latest snapshot's `created_at` is older than ~26 hours
- **THEN** the derived effective status is `fail` and the snapshot is flagged stale, regardless of its stored `overall_status`

#### Scenario: Empty table is a failure signal

- **WHEN** there is no snapshot at all
- **THEN** the derived effective status is `fail` with a "no run recorded" indication

### Requirement: Snapshot parsing tolerates malformed check rows

The system SHALL provide a pure parser that normalizes a raw snapshot's `checks` JSONB into a typed list, and SHALL not throw on missing or malformed fields. A check missing a recognized `status` SHALL be surfaced with an `unknown`/degraded status rather than crashing the page. A `checks` payload that is not an array (defense-in-depth for any row predating the array CHECK) SHALL be surfaced as a single visible "malformed payload" check rather than silently rendering as an empty, healthy-looking list.

#### Scenario: Well-formed checks parse in order

- **WHEN** `checks` is an array of valid `{key,label,status,detail,checked_at}` objects
- **THEN** the parser returns them as typed checks preserving order

#### Scenario: Malformed check does not crash

- **WHEN** a check entry is missing `status` or has an unrecognized value
- **THEN** the parser yields that entry with a safe fallback status and the page still renders

#### Scenario: Non-array payload degrades visibly

- **WHEN** the stored `checks` value is not an array (e.g. an object)
- **THEN** the parser yields a single visible "malformed payload" check with `unknown` status, so the board does not render as fresh-and-healthy with no checks

### Requirement: Site-admin System Health board

The system SHALL render a site-admin-only page at `/admin/health` that reads the latest snapshot (`created_at desc limit 1`) and displays the overall effective status prominently and one row per check with its label, a green/amber/red status pill matching the check's status, the check's detail text, and a relative "checked N min ago" freshness label derived from `checked_at`. Access SHALL be gated to site admins exactly like the peer `/admin/*` monitoring pages.

#### Scenario: Latest snapshot renders per-check rows

- **WHEN** a site admin opens `/admin/health` and a fresh snapshot exists
- **THEN** the overall status is shown prominently and each check renders a label, a color-coded status pill, its detail, and a relative freshness label

#### Scenario: Stale snapshot surfaces its own warning

- **WHEN** the latest snapshot is older than ~26 hours
- **THEN** the page prominently warns that the health run is stale/overdue in addition to any per-check state

#### Scenario: Empty state

- **WHEN** no snapshot exists
- **THEN** the page shows a clear "no health run recorded yet" empty state rather than a blank or errored screen

#### Scenario: Non-admin cannot reach the page

- **WHEN** a non-site-admin navigates to `/admin/health`
- **THEN** access is blocked by the same guard used by peer admin routes

#### Scenario: Read failure surfaces an error, not a blank screen

- **WHEN** the snapshot query fails (network/RLS/server error)
- **THEN** the page shows a visible error state rather than a blank or perpetually-loading screen

### Requirement: Recent run history strip

The system SHALL display a compact history of the most recent runs (up to 7, `created_at desc`), each rendered as a small status indicator reflecting that run's `overall_status`, so the operator can see the recent trend at a glance.

#### Scenario: History strip shows recent runs

- **WHEN** at least one snapshot exists
- **THEN** the page shows up to the last 7 runs as color-coded indicators in reverse-chronological order

#### Scenario: History strip with no runs

- **WHEN** no snapshots exist
- **THEN** the history strip is empty or hidden without error

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

### Requirement: Applied service-role table grants are verified against the deployed database

The full health run SHALL inspect every public table's applied `service_role` privileges in the deployed database and compare them with the declared hosted-role contract. The contract SHALL explicitly include all privileges intentionally inherited from the hosted platform defaults, including `TRUNCATE`, `TRIGGER`, `REFERENCES`, and `MAINTAIN`, and SHALL preserve deliberate table-specific exceptions. Any missing table, unexpected table, duplicate row, malformed fact, or privilege mismatch SHALL fail the existing `applied_acl_grants` check.

#### Scenario: Hosted service-role defaults match the contract

- **WHEN** every deployed public table grants `service_role` exactly the declared privilege set
- **THEN** the `applied_acl_grants` check reports no `service_role` drift

#### Scenario: A deliberately narrow table widens

- **WHEN** a table whose contract withholds a privilege from `service_role` gains that privilege in the deployed database
- **THEN** the next full `applied_acl_grants` check fails and identifies the table, applied privileges, and expected privileges

#### Scenario: A new table is absent from the contract

- **WHEN** a public table exists in the deployed database without a corresponding `service_role` contract row
- **THEN** the next full `applied_acl_grants` check fails rather than silently ignoring the table

#### Scenario: Migrations-only client-role verification remains environment-honest

- **WHEN** the SQL grant test runs against a migrations-only rebuild that does not reproduce hosted `service_role` defaults
- **THEN** it enforces the anon and authenticated contracts locally while identifying the deployed health check as authoritative for `service_role`

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

### Requirement: Degraded health checks expose owner and next action

The system SHALL attach remediation metadata to health checks rendered on `/admin/health`. For every failed, warning, stale, unknown, or incomplete check, the page SHALL show a plain-English owner surface or runbook destination and a next-action link. Known sync checks SHALL route to `/admin/sync`; support checks SHALL route to `/admin/support`; deleted/recovery checks SHALL route to `/admin/deleted-items`; permission/access checks SHALL route to `/admin/permissions`; payout/payment checks SHALL route to `/admin/payouts`; migration, deploy, scheduler, or manual checks SHALL route to the relevant operations runbook when no app owner surface exists.

#### Scenario: Failed sync check links to sync monitoring

- **WHEN** `/admin/health` renders a failed, warning, stale, unknown, or incomplete sync-related check
- **THEN** the check row shows `/admin/sync` as the owner action

#### Scenario: Failed payout check links to payout owner

- **WHEN** `/admin/health` renders a failed, warning, stale, unknown, or incomplete payout-related check
- **THEN** the check row shows `/admin/payouts` or the relevant operations runbook as the owner action

#### Scenario: Unknown check still has a safe fallback

- **WHEN** `/admin/health` renders a degraded check key with no known metadata
- **THEN** the check row explains that ownership is incomplete and links to the operations runbook or health details instead of rendering without a next step

### Requirement: Coverage incomplete is distinct from failed checks

The system SHALL represent health checks that are not evaluated by the current health runner as a distinct coverage-incomplete state. Coverage-incomplete items SHALL not be hidden inside generic detail text and SHALL include the owner or runbook action needed to complete coverage.

#### Scenario: Incomplete check is visible

- **WHEN** the health model marks a check as not evaluated or coverage-incomplete
- **THEN** `/admin/health` renders it as a visible incomplete state with explanatory text and a next action

#### Scenario: Incomplete state is not presented as healthy

- **WHEN** a health snapshot is otherwise healthy but has incomplete coverage
- **THEN** the page does not present the incomplete check as `ok` or omit it from the operator view

### Requirement: Recent run history is understandable without hover

The system SHALL render recent health run history with visible text or an expandable details area so a site admin can understand run status and timing without relying on hover-only dots.

#### Scenario: Recent runs show status and timing text

- **WHEN** `/admin/health` renders recent run history
- **THEN** each listed recent run exposes status and timing information as visible text or in a touch-accessible expandable detail

#### Scenario: All-green state remains glanceable

- **WHEN** all recent health runs and checks are healthy
- **THEN** the health page remains compact and easy to scan while still exposing non-hover run history

### Requirement: Health board surfaces unresolved operator alerts

The `/admin/health` board SHALL display unresolved `operator_alerts` rows (newest first) alongside the existing snapshot view, showing source, severity, title, structured detail, and age, and SHALL provide a resolve action that stamps `resolved_at`/`resolved_by`. When no unresolved alerts exist, the board SHALL show an explicit all-clear state for the alerts section.

#### Scenario: Unresolved payment alert is visible

- **WHEN** a payment failure has produced an unresolved `operator_alerts` row
- **THEN** a site admin visiting `/admin/health` sees the alert with its source, severity, and detail without querying the database

#### Scenario: Resolving clears the alert from the board

- **WHEN** the site admin resolves the alert from the board
- **THEN** the alert leaves the unresolved list and the row is retained with `resolved_at`/`resolved_by` set

#### Scenario: No alerts

- **WHEN** there are no unresolved alerts
- **THEN** the alerts section shows an explicit "no unresolved alerts" state

### Requirement: Ringside conflict volume is a daily health check

`system_health_probe()` SHALL report the current value of `ringside_conflict_seq`, and the check-runner SHALL emit a `ringside_conflicts` check in each snapshot whose detail records that raw counter value. The check's status SHALL derive from the delta against the previous snapshot's recorded value: `ok` below 1,000 conflicts since the prior snapshot, `warn` at or above 1,000, `fail` at or above 10,000. A missing baseline (first run, prior snapshot without the check) or a counter regression SHALL report `ok` with an explanatory note, never a false failure.

#### Scenario: Storm surfaces on the board

- **WHEN** more than 10,000 conflicts accumulate between two daily snapshots
- **THEN** the next snapshot's `ringside_conflicts` check is `fail` and `/admin/health` renders it red with the delta in its detail

#### Scenario: Quiet day is green

- **WHEN** fewer than 1,000 conflicts accumulate between snapshots
- **THEN** the check is `ok`

#### Scenario: First run has no baseline

- **WHEN** the previous snapshot has no `ringside_conflicts` check to diff against
- **THEN** the check reports `ok` with a note that a baseline was recorded, and the raw counter value is stored for the next run
