# 01 Oversized Files

Finder: subagent `019eb9d1-fe43-7720-baa6-ab09980fda6f`
Status: Phase 1 inventory complete; initial Phase 2 source-level verification recorded in `09-phase-2-verification.md`.

## Commands And Exclusions

Commands included `find apps packages ... '*.ts' '*.tsx'`, `wc -l`, generated-file scans, INTENT scans, and TODO cross-reference scans.

Exclusions: `node_modules`, `dist`, `build`, `coverage`, `*.test.*`, `*.spec.*`, `*.d.ts`, and generated Supabase type files:

- `packages/supabase/src/types/database.types.ts` at 9,052 lines

Wave B slice 1 collapsed the prior generated type duplicates into 11-line compatibility re-exports at `apps/myk9show/src/types/supabase.ts`, `packages/supabase/src/types.ts`, and `packages/supabase/src/database.types.ts`.

Counts:

- Raw oversized `.ts`/`.tsx`: 178
- Generated Supabase type files excluded: 1
- Real oversized files after generated exclusions: 177
- Test/mock support included by literal pattern: 7
- P1 findings from size alone: 0

Count note: the original 2026-06-10 plan baseline was 181 raw / approximately 177 real. The 2026-06-12 finder rerun used the documented literal Phase 1a pattern and found 182 raw / 178 real before Wave B type-file unification. Treat this file's count as the current audit-run count and the plan count as historical baseline.

Actionability note: broad clusters below are Phase 1 inventory only. Before any extraction wave, Phase 2 must narrow the chosen cluster to concrete file:line ranges and confirm the extraction boundary.

## Findings

| Files | Severity | Classification | Evidence | Verification | Proposed Fix | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `packages/replication/src/MutationManager.ts`, `packages/replication/src/core/ReplicatedTable.ts`, `apps/myk9show/src/providers/ReplicationSyncProvider.tsx`, sync/offline helpers | P2 | Multiple concerns | Queueing, backup, OCC, upload, conflict, and toast/provider orchestration are mixed. | Phase-2 confirmed; Wave C slice 1 implemented; see `09-phase-2-verification.md` | Mutation ordering, queue capacity, and localStorage backup helpers are extracted with focused tests; continue with OCC/backoff/conflict helpers. | High launch priority: offline-first reliability. |
| Scoring service/components including `OfflineScoringService.ts` | P2 | Multiple concerns | Scoring state, sync, conflict UI, save confirmation, and calculations are colocated in large files. | Phase-2 confirmed; see `09-phase-2-verification.md` | Extract scoring math, save dialogs, and conflict helpers with behavior tests. | High launch priority: scoring correctness. |
| `ShowMapStructureTable.tsx`, `showMapActions.ts` | P2 | Multiple concerns; INTENT-sensitive | Row rendering, keyboard focus, recommendations, and attention logic are colocated; many `// INTENT:` comments. | Phase-2 confirmed; see `09-phase-2-verification.md` | Extract render cells and pure action helpers only. | Preserve protected secretary workflow behavior. |
| Entry secretary ops: `PullManagementTab.tsx`, `useEntryManagementActions.ts`, `entries/lifecycle.ts`, `entries/secretary.ts`, `OfflineEntryCreator.ts`, `EntryValidator.ts`, `MoveUpRequestsTab.tsx` | P2 | Multiple concerns | Entry lifecycle, day-of changes, validation, bulk actions, and dialogs spread across large files. | finder-confirmed; Phase-2 pending file:line narrowing | Extract lifecycle transitions, validation, and dialog view components. | High launch priority. |
| Database read facades: `entries/reads.ts`, `judges/reads.ts`, `dogs/reads.ts`, `classes/reads.ts`, `waitlists/reads.ts`, `users/reads.ts` | P2 | Multiple concerns | Many exported query families plus PostgREST fallback/local mapping. | finder-confirmed; Phase-2 pending file:line narrowing | Split by query family and shared mapping/fallback helpers. | Also relevant to duplication audit. |
| Registration/show creation wizards and dog/class selection steps | P2 | Multiple concerns | Page orchestration plus data loading, audience behavior, dialogs, and UI rows. | finder-confirmed; Phase-2 pending file:line narrowing | Extract wizard orchestration hooks and row/list subcomponents. | Dog picker audience issue already tracked. |
| Payment/email edge functions and `cartStore.ts` | P2 | Multiple concerns | Checkout, webhook, send-email branches and handlers in single files. | finder-confirmed; Phase-2 pending file:line narrowing | Split handlers by event/request type with assertion-first payment tests. | Cross-reference Stripe launch checklist. |
| Offline check-in/gate services and UI | P2 | Multiple concerns | Show-day check-in state, validation, UI, and coordination are large. | finder-confirmed; Phase-2 pending file:line narrowing | Extract validators/coordinator helpers and presentational sections. | High launch priority. |
| Auth/RBAC core: `AuthContext.tsx`, `RoleManager.ts`, `RBACTestPage.tsx` | P2 | Multiple concerns | Auth provider mixes profile, RBAC loading, dev aliases, protected routes. | finder-confirmed; Phase-2 pending file:line narrowing | Split provider helpers/routes cautiously. | Security-adjacent; route security issues separately. |
| Core Zustand stores | P2/P3 | Mostly multiple concerns | Large stores contain derived helpers plus mutations/selectors. | finder-confirmed; Phase-2 pending file:line narrowing for P2 stores | Extract helpers/selectors first; split stores when touched. | Entry/class/show stores are P2; admin/search stores P3. |
| Email style templates | P3 | One concern but sibling duplication likely | Large style-specific confirmation templates. | Confirmed. | Keep for now; duplication audit owns shared helper assessment. | Not show-day critical. |
| Admin/deployment/monitoring/analytics services and dashboards | P3 | Lower-priority multiple concerns | Large but not launch-critical show-day paths. | Confirmed. | Extract opportunistically when touched. | No size-only P1/P2 launch blocker. |
| Static/support data and type files | P3 | One concern long | Data/type registries rather than mixed workflows. | Confirmed. | Keep unless churn continues. | Not extraction priority. |

## Known Cross-References Only

| Files | Existing Tracking | Notes |
| --- | --- | --- |
| `EnrollmentCard.tsx` | `OPEN-TODOS.md` bulk-select item | Already tracked; do not refile from this audit. Extract payment/refund/email/entry-row pieces when that work happens. |
