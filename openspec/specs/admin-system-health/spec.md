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
