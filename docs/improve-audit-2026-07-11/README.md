# Codebase Health Audit — 2026-07-11

> **Status:** Active

Whole-codebase audit (`codebase-health --plan`, standard effort) against commit `15897d862`. Four parallel read-only auditors (correctness+tests, tech debt+architecture, performance+deps, DX+docs+direction); every finding below was then hand-vetted — the cited code was opened and confirmed before it earned a plan. Security was **excluded**: it was audited separately the same day ([../security-audit-2026-07-11.md](../security-audit-2026-07-11.md)), and the prior bug audit ([../improve-audit-2026-07/README.md](../improve-audit-2026-07/README.md), all 5 plans DONE) was pre-loaded as a rejected/settled ledger so nothing is re-reported.

## Verification gates (every plan uses these)

| Purpose   | Command                                     |
| --------- | ------------------------------------------- |
| Typecheck | `pnpm typecheck` (never raw tsc)            |
| Lint      | `pnpm lint`                                 |
| App tests | `cd apps/myk9show && pnpm test`             |
| One file  | `cd apps/myk9show && npx vitest run <path>` |

Rules of the road for executors: work in a worktree, never the primary checkout; assertion-first tests for value-sensitive fixes (red before the fix, green after); files under 500 lines; use the custom render from `src/test/utils/testUtils.tsx`.

## Plans — execution order & status

| Plan | Title | Severity | Effort | Risk | Status |
| --- | --- | --- | --- | --- | --- |
| [001](001-show-date-utc-classification.md) | Shows classified past/active up to a day early (raw `new Date()` on DATE columns, 5 modules) | HIGH / correctness | M | MED | TODO |
| [002](002-date-util-and-enum-map-hardening.md) | Harden `toLocalDateOnly` + unguarded status/eventType map lookups | MED / correctness | S | LOW | TODO |
| [003](003-typecheck-test-files.md) | 1,369 test files invisible to typecheck — add a test-tsconfig gate | MED / DX | M | LOW | IN PROGRESS — Stage 1 blocking allowlist |
| [004](004-ws-override-security-bump.md) | `pnpm.overrides` pins `ws` below its DoS patch (sole prod-audit advisory) | LOW / deps | S | LOW | TODO |
| [005](005-publish-judge-steward-guide.md) | Judge/steward guide is written but unpublished; docs site missing the role | MED / docs | S | LOW | TODO |
| [006](006-intent-and-debt-register-reconcile.md) | INTENT.md §6 documents the deleted myK9Q as live; debt registers claim "0 open" | MED / docs-integrity | S | LOW | TODO |
| [007](007-replication-core-split.md) | Finish decomposing MutationManager + ReplicatedTable — verified implementation complete; PR pending | MED / architecture | L | MED | REVIEW |
| [008](008-secretary-dayof-plan-consolidation.md) | Day-of plan cluster: 8 Active plans → 2; per-plan archive verdicts pre-decided with verify steps | MED / docs-integrity | S | LOW | TODO |
| [009](009-advisor-disposition-sweep.md) | Supabase advisor disposition: 364 lints → per-class verdicts; anon EXECUTE default-deny + allowlist queries; go-live item #7 | HIGH / security-hygiene | M | MED (live DB) | TODO |

Dependency order: none block each other; 001 before 002 is mildly preferred (002's tests build on 001's helper usage). 003 will surface a backlog of pre-existing test type errors — budget for triage, don't bail.

## Backlog (found, vetted, deliberately not planned this round)

- ~~Split `MutationManager.ts` / `ReplicatedTable.ts`~~ — **promoted to [Plan 007](007-replication-core-split.md)** (2026-07-11). A full deep-read revised the risk down: both files are already ~60% decomposed and the extraction idiom is proven in-package; 007 contains the module boundaries, frozen contracts, invariant list, and phase order, making it cheap-executor-safe.
- ~~**Refund dialog pair**~~ — **promoted to a tracked todo** (2026-07-12, OPEN-TODOS.md § "Backlog conversions"). `RefundEntryDialog.tsx` vs `EnrollmentRefundDialog.tsx` may be parallel surfaces for one workflow. Investigate-first before consolidating. (M, money path)
- ~~**Enrollment card view unpaginated**~~ — **promoted to a tracked todo** (2026-07-12). `RegistrationView.tsx:264` maps all groups; table view paginates at 25. Add pagination/windowing to card mode. (M)
- **Payment-dialog cluster** (5+ dialogs in `components/entries/management/`) — consolidation lead, LOW confidence; verify each maps to a distinct action first. (Left parked — low confidence; re-verify before promoting.)
- ~~**`services/database/{entries,judges,dogs}/reads.ts` trio**~~ — **promoted to a tracked todo** (2026-07-12). Re-measured 862 + 771 + 763 = **2396 L**; repeated shape, candidate for a shared read-builder. (M–L)
- ~~**docs/README.md "Active" reconcile**~~ — **promoted to a tracked todo** (2026-07-12). Re-measured: 60 `Active` rows + **2 `Complete`-but-unarchived** (`plan-dynamic-qa-infrastructure`, `plan-replication-occ-watermark-findings`). The two originally-cited examples (`plan-lane-2-2-entry-multiselect`, `plan-block-person-delete-owns-dogs`) were already archived since this audit. (M)
- **CI: 3 vitest shards always run on cache miss** — documented trade (shard correctness vs turbo affected-skip); revisit only if CI cost becomes a problem. (L) — left parked.
- **Direction options** (for the maintainer, not ranked against bugs): (A) first-club onboarding seam — publish/finish role guides + first-run path _(covered by the docs-guide todos)_; (B) ~~consolidate the fragmented secretary day-of plan cluster~~ — **resolved into [Plan 008](008-secretary-dayof-plan-consolidation.md)** (2026-07-11): the cluster read revealed the fragmentation was mostly *stale statuses*, not open work — 5-6 of 8 plans shipped; (C) verify `/at-show` offline + tablet maturity actually matches the absorbed myK9Q before first show day. **DECISION 2026-07-12: prioritize (C)** — executed via the prioritized `/at-show` judge-scoring walk todo (OPEN-TODOS.md § "Day-of Plan Consolidation — residuals").

## Considered and rejected (don't re-audit)

- `useDogsQuery` admin double-fetch — **already fixed** in `useDogsDatabase.ts:38-56` (in-code comment documents the removal). Memory updated.
- Heavyweight PDF/chart deps on the critical path — **clean**: all reached via `lazy()` routes + dynamic `import()`.
- Missing FK indexes on entries/classes — **clean**: all hot FKs covered, plus composites.
- Show-day polling intervals (30/60s) — deliberate live-ringside design; `staleTime == refetchInterval`, global auto-refetch disabled.
- `show-presence` cluster as dead code — **wrong**: live shipped feature (Phases 1–3, imported by 17+ modules). Do not delete.
- myK9Q dead code in src — none; remaining hits are branding strings and stale gitignored `coverage/` output.
- Core dep drift — react 19 / vite 7 / supabase-js 2.108 current; no node `stripe` package (Deno URL imports).
- One auditor run returned prompt-injection-shaped output instead of findings (instructions claiming to supersede mine); it was discarded unfollowed and the audit re-run clean.
