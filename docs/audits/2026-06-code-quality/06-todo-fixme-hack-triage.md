# 06 TODO/FIXME/HACK Triage

Finder: subagent `019eb9d2-8fa7-7c72-9a5e-9c6c68232486`
Status: Phase 1 inventory complete.

Counts:

- 75 raw marker lines in broad scan
- 24 live source/migration/function markers after excluding docs/meta
- 0 live `FIXME`
- 0 live `HACK`
- All 24 live markers triaged below

## Findings

| File:Line | Marker Summary | Classification | Severity | Evidence | Verification | Proposed Action | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `supabase/functions/validate-passcode/index.ts:251` | Nationals/Regular source hardcoded to `Regular` | file-as-todo | P2 | Affects `competition_type`; related DB function has same gap. | finder-confirmed; Phase-2 pending | Add one OPEN-TODOS item for real Nationals discriminator. | Consolidate with migration item. |
| `apps/myk9show/src/store/syncQueue.ts:10` | Stub sync queue for skipped tests | fix-now | P3 | `rg useSyncQueue` only finds this file; real queues live elsewhere. | Finder-confirmed; needs deletion verification. | Delete unused stub if tests/typecheck confirm no importer. | Stale surface. |
| `supabase/migrations/20260526200000_fix_class_completion_nationals_source.sql:41` | DB placement uses `v_is_nationals=false` | file-as-todo | P2 | `recalculate_class_placements` receives hardcoded false. | finder-confirmed; Phase-2 pending | Same consolidated Nationals discriminator todo. | Do not edit migration directly unless superseded. |
| Same migration `:108` | Function comment repeats Phase 1 TODO | keep-with-reason | P3 | Deployed schema comment documents current behavior. | Finder-confirmed. | Update via future migration when discriminator lands. | Historical DB comment. |
| `apps/myk9show/src/services/database/show-incidents.ts:31` | Narrow manual type for `show_incidents` | fix-now | P3 | Generated types include `show_incidents`. | Finder-confirmed. | Replace bridge with generated type. | Type cleanup. |
| `apps/myk9show/src/hooks/useEntryManagementActions.ts:589` | Extra show query for secretary email/CC fields | fix-now | P3 | `EntryManagementShow` is slim; `shows` type has fields. | Finder-confirmed. | Widen show shape/getter and remove ad-hoc query. | Small DRY cleanup. |
| `apps/myk9show/supabase/functions/stripe-connect-onboard/index.ts:135` | Stripe Accounts v2 migration note | file-as-todo | P2 | Existing Stripe go-live items do not cover this exact API migration. | finder-confirmed; Phase-2 pending | Fold into Stripe go-live checklist. | Payment launch risk. |
| `apps/myk9show/src/services/mappers/showMappers.ts:40`, `:243` | Remove show casts after type regen | fix-now | P3 | Generated types include referenced columns. | Finder-confirmed. | Remove casts/comments if typecheck passes. | Same cleanup cluster. |
| `packages/ringside/src/pages/EntryList/pageProps.ts:11`, `:609`, `:731`; `packages/ringside/src/index.ts:283` | Resolved TODO placeholder/layout-slot comments | delete-comment | P3 | Comments say or refer to resolved placeholders. | Finder-confirmed. | Reword/remove TODO markers. | Stale. |
| `apps/myk9show/src/hooks/useDogStoreCompat.ts:98` | Dog and registrations not atomic | file-as-todo | P2 | Dog create can succeed before registration sync. | finder-confirmed; Phase-2 pending | Add OPEN-TODOS item for `create_dog_with_children` RPC. | Reliability gap. |
| `apps/myk9show/src/pages/judge/JudgeCheckInDashboard.tsx:37` | Hardcoded empty ring assignments | file-as-todo | P1 | `/judge/check-in` is routed; UI can show false empty state. | finder-confirmed; Phase-2 pending route/data verification | Add launch-blocking TODO or wire real query. | Show-day reliability. |
| `apps/myk9show/src/utils/show-management-tracking.ts:133` | Site admin treated as club admin pending real membership | file-as-todo | P2 | Scope accuracy matters for role semantics. | finder-confirmed; Phase-2 pending liveness verification | Verify liveness, then use RBAC scopes or delete utility. | Avoid misleading relationship state. |
| `apps/myk9show/src/hooks/useEmailStatus.ts:22` | `as any` for `email_log` | fix-now | P3 | Generated types include `email_log`. | Finder-confirmed. | Remove bridge/comment. | Type cleanup. |
| `apps/myk9show/src/components/shows/ShowDetails/ShowStatistics/index.tsx:38`, `:58` | Legacy icon/color class adapters | keep-with-reason | P3 | Upstream `ShowStat` still uses class strings. | Finder-confirmed. | Keep until stat model changes. | Not launch-critical. |
| `apps/myk9show/src/hooks/queries/useShowResults.ts:37` | Cast for `view_entry_with_results` | fix-now | P3 | Generated types include view. | Finder-confirmed. | Remove cast/comment. | Type cleanup. |
| `apps/myk9show/src/pages/secretary/ShowCreationWizard/saveShowAtomicOnline.ts:66` | Cast for `create_show_with_children` RPC | fix-now | P3 | Generated types include RPC. | Finder-confirmed. | Type RPC call directly. | Type cleanup. |
| `apps/myk9show/src/providers/QueryProvider.tsx:13` | React Query Devtools note | delete-comment | P3 | Dependency not installed; not launch/code-quality work. | Finder-confirmed. | Delete comment. | Placeholder clutter. |
| `apps/myk9show/src/components/dogs/DogDetails/TitleTracking/RollingTitleProgress.tsx:119` | Sport label hardcoded to Scent Work until multi-sport | keep-with-reason | P3 | Product/docs say Scent Work first. | Finder-confirmed. | Keep behavior; optionally reword without TODO. | INTENT supports title progress visibility. |
| `apps/myk9show/src/components/landing/v2/WaitlistFormLanding.tsx:59` | Cast for `platform_waitlist` after migration 197 | fix-now | P3 | Generated types include `platform_waitlist`. | Finder-confirmed. | Remove custom client cast/comment. | Preserve low-friction INTENT. |

## Commands

Read-only commands included plan/INTENT/backlog reads, broad `rg -n -S "\\b(TODO|FIXME|HACK)\\b"` scans across `apps`, `packages`, and `supabase` with generated/build exclusions, count scans, and targeted backlog/doc checks.
