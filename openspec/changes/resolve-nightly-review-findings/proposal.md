# Proposal

## Why

The nightly review found an authorization bypass and reliability defects in trial deletion, judge saves, offline identity, saved drafts and deployment tests. Repair these existing contracts before fall 2026 launch, prioritizing show-day trust.

## What Changes

- MYK9-939: fail closed on nullable withdrawal ownership, preserving legitimate actor and lifecycle rules.
- MYK9-938: apply trial tombstones through existing replication, counts and restore paths.
- MYK9-834: preserve confirmed same-user ringside claims on refocus while clearing actual identity changes.
- MYK9-940: reject a failed required judge write before success, leaving post-save cache refresh best-effort.
- MYK9-936: migrate prior wizard trial dateTime drafts into the existing separate day/time fields.
- MYK9-937: retain exact deploy-picker boundary assertions with bounded fixture cost and a justified scoped process-test budget if required.

Does this duplicate an existing surface? No. These are repairs to current hooks, tables, forms and tests; no new page, dialog, affordance or data-write path is introduced.

## Capabilities

### New Capabilities

- `entry-self-removal-authorization`: NULL-safe owner/manager admission for Pull and Withdraw.
- `trial-soft-delete-replication`: authoritative tombstones remain absent locally until restore.
- `ringside-offline-identity`: same-user sign-in preserves offline identity with explicit clearing controls.
- `wizard-draft-recovery`: preserve prior date/time data during persisted-shape migration.

### Modified Capabilities

- `class-mgmt-mutation-error-feedback`: the shared class edit requires judge preparation to succeed before Saved.

## Impact

SQL withdrawal migration/tests, trial replication/mapping/tests, auth event/cache tests, shared class edit hook/panel tests, wizard migration/hydration tests, QA deploy-picker test fixture. No dependencies or new UI. Separate commits/review units for SQL authorization, auth/offline, app repairs and harness.

Non-goals: payments/refunds, production/shared fixtures, deployments, broader CRUD redesign, incompatible schema changes, closing issues without their proof gates. MYK9-639/648 require separately authorized end-to-end evidence; prepare gates, do not fabricate resolution.
