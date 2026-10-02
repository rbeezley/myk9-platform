# Spec Delta

## Purpose

Preserve existing launch-critical workflow correctness and recovery at the trial-soft-delete-replication boundary.

## ADDED Requirements

### Requirement: Deleted trials remain absent until restoration

The local replica SHALL apply authoritative soft deletion during incremental/full sync and cold startup, exclude deleted trials from active counts and reads, and accept a newer authorized restoration without altering unrelated trials.

#### Scenario: Deletion synchronizes

- **WHEN** a live trial is soft-deleted and the replica synchronizes
- **THEN** it remains absent across incremental/full sync and reload

#### Scenario: Restoration synchronizes

- **WHEN** an authorized newer restore reaches the replica
- **THEN** exactly the restored trial returns while unrelated scope remains intact
