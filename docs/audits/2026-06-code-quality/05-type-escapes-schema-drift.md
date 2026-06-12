# 05 Type Escapes And Schema Drift

Finder: subagent `019eb9d2-75a5-7762-a1bc-d62d120a8829`
Status: Phase 1 inventory complete; initial Phase 2 verification recorded in `09-phase-2-verification.md`.

## Phase 2 Update

Confirmed: generated type divergence, stale visibility/settings/secretary/judge casts, and the dead/schema-drift status of `entryService.ts`.

Caveat: `audit_entry` remains a real type gap, but current DB existence should be verified before adding a typed table contract. Type-file canonicalization is the prerequisite for most cleanup here.

## Counts

- `as any`: 26 matching lines total
- Production-code `as any`: 23 lines
- Comment-only `as any`: 3 lines
- Broad `String(...)` / `Number(...)`: 668 hits across 274 files
- DB-adjacent coercion heuristic: 101 files
- Broad status literal scan: 531 hits
- Status/check-constraint trace scan: 87 hits
- Direct `// INTENT:` in inspected hit files: 1

## Findings

| File:Line | Pattern | Classification | Severity | Evidence | Verification | Proposed Fix | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `apps/myk9show/src/services/AuditService.ts:175`, `:218`, `:546` | `query: any`, `supabase as any`, `data as any[]`, `row: any` | real type gap | P2 | `audit_entry` exists only in app-local migrations and is absent from app generated types. | Phase-2 confirmed with DB-schema caveat | Add/regenerate canonical `audit_entry` type and type query/insert rows. | Verify current DB table existence before typing; then handle with canonical type-file consolidation. |
| `apps/myk9show/src/hooks/mutations/useShowSettingsMutations.ts:17` | `supabase as any` | lazy escape | P2 | Visibility tables exist in app generated types. | finder-confirmed; Phase-2 pending | Remove cast; use typed client/`TablesInsert`. | Comment is stale. |
| `apps/myk9show/src/services/database/shows/writes.ts:105` | `supabase.rpc as any` | lazy escape | P3 | `soft_delete_show` exists in generated RPC types. | confirmed | Use typed RPC call. |  |
| `apps/myk9show/src/hooks/useExhibitorProfile.ts:219` | `from(...) as any` | lazy escape | P3 | `exhibitor_profiles.onboarding_completed_at` exists in app types. | confirmed | Remove cast. |  |
| `apps/myk9show/src/services/database/classes/reads.ts:434` | `supabase.rpc as any` | lazy escape | P3 | `soft_delete_class` exists in generated RPC types. | confirmed | Remove cast. |  |
| `apps/myk9show/src/hooks/useDbNotifications.ts:29`, `:48`, `:67` | `supabase as any` | lazy escape | P3 | `notifications` and `notifications.read_at` exist in app types. | confirmed | Remove casts; type notification row. | Comment is stale. |
| `apps/myk9show/src/hooks/useEmailStatus.ts:25` | `supabase as any` | lazy escape | P3 | `email_log` exists in app types. | confirmed | Remove cast; use typed `EmailLogEntry`. | Also covered by TODO triage. |
| `apps/myk9show/src/services/database/dogs/reads.ts:467` | `supabase.rpc as any` | lazy escape | P3 | `soft_delete_dog` exists in generated RPC types. | confirmed | Remove cast. |  |
| `apps/myk9show/src/services/replication/resolveClassVisibility.ts:17` | `supabase as any` | lazy escape | P2 | Visibility tables exist in app types. | finder-confirmed; Phase-2 pending | Use typed rows. | Replication-adjacent. |
| `apps/myk9show/src/hooks/queries/useOrganizationAgreement.ts:12` | `supabase as any` | lazy escape | P3 | `organization_agreements` exists in app types. | confirmed | Remove cast. | Comment is stale. |
| `apps/myk9show/src/hooks/queries/useShowSettingsDatabase.ts:25` | `supabase as any` | lazy escape | P2 | Visibility tables exist in app types. | finder-confirmed; Phase-2 pending | Remove cast; use generated row types. | Secretary-facing settings. |
| `apps/myk9show/src/hooks/queries/useSelfCheckinEnabled.ts:15` | `supabase as any` | lazy escape | P2 | Visibility tables exist in app types. | finder-confirmed; Phase-2 pending | Remove cast. | Show-day path. |
| `apps/myk9show/src/hooks/queries/useSecretaryTasks.ts:12` | `supabaseClient as any` | lazy escape | P2 | `secretary_tasks` exists; status check in migration 133. | finder-confirmed; Phase-2 pending | Remove cast; use schema row type. | Secretary workflow. |
| `apps/myk9show/src/hooks/queries/useShowResults.ts:39` | `supabase as any` | lazy escape | P3 | `view_entry_with_results` exists in app views. | confirmed | Use typed view row or `.returns<ClassResultRow[]>()`. |  |
| `apps/myk9show/src/hooks/queries/useJudgeDayCapacity.ts:31` | `supabase as any` | lazy escape | P2 | `judge_day_summary` exists in app views. | finder-confirmed; Phase-2 pending | Remove cast; type view row. | Judge capacity planning. |
| `apps/myk9show/src/hooks/queries/useJudgeAssignments.ts:14` | `supabaseClient as any` | lazy escape | P2 | `judge_assignments` and selected joined columns exist. | finder-confirmed; Phase-2 pending | Use typed client plus explicit return type if join inference needs help. | Offline fallback is intentional. |
| `apps/myk9show/src/hooks/queries/useJudgeCheckInStats.ts:7` | `supabaseClient as any` | lazy escape | P2 | `judge_assignments`, `classes`, and `trials` columns exist. | finder-confirmed; Phase-2 pending | Use typed client or explicit return type. |  |
| `apps/myk9show/src/components/shows/ShowDetails/dialogs/DeleteShowDialog.tsx:46` | `supabase.rpc as any` | lazy escape | P3 | `hard_delete_show` exists in RPC types. | confirmed | Remove cast. | Admin-only. |
| `apps/myk9show/src/features/admin-help/hooks/useExampleIds.ts:11` | `table as any` | deliberate boundary coercion | P3 | Runtime table name cannot infer literal table union. | confirmed | Prefer constraining `table` to `keyof Database['public']['Tables']` or keep with comment. | Admin-help utility. |
| `apps/myk9show/src/services/entryService.ts:21` | writes `{ status }` to `entries` | schema drift | P2 | Generated `entries` has `entry_status`, `check_in_status`, `is_in_ring`; no `status` column. `markInRing` had no direct app caller found. | Phase-2 confirmed dead/schema-drift | Delete in Wave A rather than repairing. | Cross-referenced in dead-code inventory; future in-ring work should use a replication-backed adapter. |

## Deliberate Boundary Coercions

| File:Line | Pattern | Reason | Action |
| --- | --- | --- | --- |
| `atShowDataAdapter.ts:86`, `:119`, `:121`, `:165` | `Number(...)` / `String(...)` | Bridges myK9Show replication to ringside types; DB armband is text. | Keep. |
| `ReplicatedEntriesTable.ts:179`, `:191`, `:294-300` | `String(final_placement)` / `Number(finalPlacement)` | Compatibility type stores placement differently than DB; tests cover it. | Keep; consider future typed boundary refactor only. |
| `day-of-operations/entries.ts:190` | `armband: String(nextArmband)` | `entries.armband` is text and nearby INTENT says walk-in assignment is local-first. | Keep. |
| `armbands/secretary.ts:22`, `:32` | `String(max)`, `Number(starting_armband_number)` | Text armbands with numeric sort/config. | Keep. |

## Main Takeaway

Most non-audit `as any` casts are stale after codegen caught up. The real type gap is `audit_entry`; the `entryService.ts` schema-drift finding should be handled deletion-first because `markInRing` appears uncalled.
