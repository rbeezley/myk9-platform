# judge-assignment-offline-writes Specification

## Purpose
Require all show-reachable judge-assignment writes to flow through the replication layer so offline reassignments queue locally and sync on reconnect, and dependent class snapshots refresh through replicated touches rather than direct table writes.

## Requirements
### Requirement: Judge assignment writes go through the replication layer

All judge-assignment write paths reachable during a show (persisting show-level assignments, upserting a class judge, reassigning a class judge) SHALL write through `ReplicatedJudgeAssignmentsTable` rather than direct Supabase table access, so changes made offline are queued and synced on reconnect.

#### Scenario: Offline class judge reassignment survives reconnect

- **WHEN** a secretary reassigns a class judge while the device is offline
- **THEN** the write is queued by the replication layer and syncs when connectivity returns, instead of failing or being lost

#### Scenario: No raw table writes remain

- **WHEN** the judge-assignment service module is inspected
- **THEN** no write to `judge_assignments` bypasses the replicated table wrapper
