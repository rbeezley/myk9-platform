# 03 Duplication Clusters

Finder: subagent `019eb9d2-3c95-7261-abb7-537932241cd6`
Status: Phase 1 inventory complete; initial Phase 2 verification recorded in `09-phase-2-verification.md`.

## Findings

| Cluster | Files | Severity | Evidence | Verification | Proposed Fix | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Generated Supabase types are divergent, not just duplicated | `packages/supabase/src/database.types.ts`, `packages/supabase/src/types/database.types.ts`, `packages/supabase/src/types.ts`, `apps/myk9show/src/types/supabase.ts` | P1 | Line counts differ: 5,204 / 7,742 / 7,550 / 9,052; hashes differ. App-local type has surfaces missing from package-exported type. Package export and app client import different files. Type generation path/docs disagree. | Phase-2 confirmed | Pick one canonical package-owned generated file, regenerate once, make app imports consume/re-export it, delete stale copies or replace with type-only re-exports, and fix generation docs/scripts. | Duplication not justified: schema drift can silently type DB surfaces differently. |
| Replication/PostgREST read-shape duplication | `entries/reads.ts`, `classes/reads.ts`, `dogs/reads.ts`, `trials/reads.ts` | P2 | Each maintains replicated read, manual join mapping, and PostgREST select fallback; existing helpers only cover fallback/map construction. | Phase-2 confirmed | Extract narrow helpers for replicated lookup loading, sorting parity, and `{ data, error }` fallback behavior. Add parity tests for high-risk show-day reads. | Avoid building a broad ORM. |
| `judges/reads.ts` is not the same duplication concern | `judges/reads.ts` | P3/refuted for this dimension | Mostly qualification/certification/assignment operations using `untypedFrom`, not the replication fallback sibling pattern. | Refuted for Phase 1c. | Route to oversized/type-drift audits if needed. | Do not file as duplicated reads solely due to size. |
| Magazine/Gazette confirmation email siblings duplicate transactional renderer structure | `supabase/functions/send-confirmation-email/magazine-email.ts`, `gazette-email.ts`, `packages/email/src/templates/MagazineConfirmationEmail.tsx`, `GazetteConfirmationEmail.tsx`, `packages/email/src/types.ts` | P2 | Production builders duplicate escaping, multiline, run table, on-the-day, contact, CTA, and signoff patterns. React templates duplicate run table/data-shape rendering. | Phase-2 confirmed, refined | Keep visual templates separate; extract shared transactional helpers and base confirmation data type. | Outlook/Deno constraints justify some duplication; direct edge tests exist, so the gap is parity/shared contract. |
| Email package preview vs edge-function production renderer drift risk | Magazine/Gazette React templates and Deno edge builders | P2 | React template comments say it is not the production renderer; edge files say to keep React template and Deno builder in sync. | Phase-2 confirmed, refined | Add shared style acceptance/golden tests so preview and production renderer cannot drift silently. | Structural duplication is justified; missing sync guard is the issue. |
| Empty states/stat cards | shared and local components | Refuted | Most current stat usage imports `@myk9/ui`; local empty states are often role/surface-specific copy. | Refuted as new cluster. | No Phase 1c filing. | Similar layout/copy is sometimes intentionally role-specific. |

## Known Cross-References Only

| Cluster | Existing Tracking | Notes |
| --- | --- | --- |
| Item action menus plus two generic `ThreeDotMenu` primitives | `OPEN-TODOS.md` shared 3-dot/kebab menu consolidation | Already tracked; update the existing TODO's file list to include both generic implementations. Preserve visible primary CTA; overflow is secondary only. |
| Filter primitives and `EntryFiltersCard` | Existing FilterBar -> FilterChips plan docs | Do not refile `EntryFiltersCard` divergence. It has INTENT explaining no status filter; canonical primitive choice needs human/product judgment. |

## Commands

Read-only commands included branch/worktree checks, plan/INTENT/backlog reads, `rg` for known duplication terms, file discovery for Supabase types, `wc -l`, `shasum`, `git diff --no-index --stat`, scans of database read facades, row action menus, filter primitives, and email templates/builders.
