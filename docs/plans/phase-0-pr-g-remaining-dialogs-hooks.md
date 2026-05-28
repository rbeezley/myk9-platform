# Phase 0 — PR G: Remaining dialogs + ringside hooks (mop-up → close Phase 0)

**Status:** Discovery complete; minimal/delete-only execution (mirrors PR F decision).
**Author:** Claude (session, 2026-05-28)
**Predecessors:** PR F (#419, scoresheets) + CI speedup (#420), both merged.
**Parent plan:** [`phase-0-ringside-package.md`](phase-0-ringside-package.md) line 162 (PR G).

---

## TL;DR

PR G was scoped as "move remaining ringside dialogs + hooks into `@myk9/ringside`." Discovery found there is **nothing left to move** — the package is already complete for Phase 0. Like PR F, the honest deliverable is a **deletion + a completeness note**:

1. **Delete 2 dead hooks** (`useClassFilters`, `useClassSelection` + their tests) — zero importers repo-wide.
2. **Document** that the ringside package is Phase-0-complete: dialogs are slot-injected (host-side), the remaining ringside-candidate hooks are host-coupled (correctly app-side) or Nationals (deferred), and the ClassList page is a correct host shim.

This **closes Phase 0**.

---

## Discovery findings

### Finding 1 — dialogs are slot-injected, not moved

`packages/ringside` consumes host dialogs through **slot contracts** (`pages/EntryList/dialogSlots.ts`, `pageProps.ts`, `CombinedEntryListDialogs.tsx`). The dialog *components* (`ClassOptionsDialog`, `ClassStatusDialog`, `MaxTimeDialog`, `RunOrderDialog`, `ScoresheetPrintDialog`, etc.) correctly **stay in `apps/myk9q/src/components/dialogs/`** as the host's slot implementations. Moving them into ringside would be wrong — the host owns its dialog visuals. **Nothing to move.**

### Finding 2 — ringside-candidate hooks are accounted for

Plan §2.1 listed: `useClassFilters`, `useClassSelection`, `useFavoriteClasses`, `useShowAccent`, `useAreaManagement`, `useClassCompletion`, `useNationals*`.

| Hook | State | Disposition |
|---|---|---|
| `useFavoriteClasses`, `useClassStatus`, `useClassDialogs`, `useClassRealtime` | already in `packages/ringside/src/pages/ClassList/hooks/` | done |
| `useClassCompletion` | imports `Replicated{Classes,Entries}Table` + `replicationHelper` | **host-coupled → stays app-side** (§3) |
| `useShowAccent` | imports `@/services/replication` | **host-coupled → stays app-side** |
| `useAreaManagement` | imports host `services/scoresheets/areaInitialization` | **host-coupled → stays app-side** (used by scoresheet host glue, see PR F) |
| `useNationalsScoring`, `useNationalsCounters` | Nationals (`nationalsStore`, `nationalsScoring`) | **deferred (Q4)** |
| `useClassFilters`, `useClassSelection` | **zero importers repo-wide; not used by the ClassList tree** | **dead → DELETE** |

### Finding 3 — the ClassList page is a correct host shim (not unfinished E1)

`apps/myk9q/src/pages/ClassList/ClassList.tsx` imports pieces from `@myk9/ringside` (helpers, `useFavoriteClasses`, types) but the page orchestration stays app-side because it's wired to `ensureReplicationManager`, `supabase`, `useAuth`, and the host `useClassListData`. This is the **Path A shim pattern** (same as the scoresheet pages in PR F) — host-coupled orchestration stays in the host, presentational/pure pieces live in ringside. It is **correct as-is**, not leftover work.

---

## Execution (this PR)

- **Delete** (dead, zero importers):
  - `apps/myk9q/src/hooks/useClassFilters.ts` + `useClassFilters.test.ts`
  - `apps/myk9q/src/hooks/useClassSelection.ts` + `useClassSelection.test.ts`
- **Doc truth-ups:** mark PR G complete in the parent plan; clean stale references to the deleted hooks (`docs/superpowers/plans/2026-04-05-myk9q-database-alignment.md`, `apps/myk9q/.claude/commands/validate.md` if current-state).

### Testing phase

- `pnpm typecheck` (whole monorepo) clean — proves no live import path broke.
- `pnpm lint` clean.
- myK9Q scoped vitest run for `src/pages/ClassList` + `src/hooks` survivors — confirm no surviving test referenced the deleted files.

## Phase 0 status after this PR

Phase 0 (PRs A–G) is **complete**: `@myk9/ringside` holds the shareable ringside surface (auth hooks, stores, ClassList helpers/hooks, EntryList page, RingsideProvider context). Everything still in `apps/myk9q` is correctly host-side: app-shell, replication orchestration, host-coupled hooks, slot-injected dialog components, and thin page shims. `apps/myk9show` does not yet consume ringside — that is Phase 1's `/at-show` route.
