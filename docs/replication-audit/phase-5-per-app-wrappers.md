# Phase 5: Per-App Wrapper Audit

**Audited:** 16 wrappers in apps/myk9q/src/services/replication/tables/ (3,923 lines total)
**Date:** 2026-04-20
**Auditor:** Claude + Richard

## Classification

### Bucket A (scoring-critical — full audit)

- ReplicatedEntriesTable.ts (337 lines)
- ReplicatedClassesTable.ts (308 lines)
- ReplicatedShowsTable.ts (321 lines)
- ReplicatedTrialsTable.ts (264 lines)

### Bucket B (config/visibility — spot-check)

- ReplicatedClassVisibilityOverridesTable.ts (228 lines)
- ReplicatedShowVisibilityDefaultsTable.ts (182 lines)
- ReplicatedTrialVisibilityOverridesTable.ts (222 lines)
- ReplicatedClassRequirementsTable.ts (279 lines)

### Bucket C (views/notifications — read-only verification)

- ReplicatedAnnouncementReadsTable.ts (168 lines)
- ReplicatedAnnouncementsTable.ts (181 lines)
- ReplicatedAuditLogViewTable.ts (274 lines)
- ReplicatedNationalsRankingsTable.ts (235 lines)
- ReplicatedPushNotificationConfigTable.ts (173 lines)
- ReplicatedPushSubscriptionsTable.ts (217 lines)
- ReplicatedStatsViewTable.ts (271 lines)
- ReplicatedEventStatisticsTable.ts (263 lines)

## Bucket A findings

(populated in Task 5.2)

## Bucket B + C findings

(populated in Task 5.3)

## Remediation plan

(populated as findings accumulate)
