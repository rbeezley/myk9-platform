## 1. MYK9-141 — Deterministic guarded remote judge fixture

- [x] 1.1 Add a red pure reconciliation test proving stale grants are deactivated, declared grants are reactivated, and missing grants are inserted without contacting Supabase.
- [x] 1.2 Update the guarded remote E2E account setup to preview and apply the exact declared scoped role matrix; applying it remains an explicit shared-system approval gate.
- [x] 1.3 Add and test assigned, unassigned, and no-assignment judge subjects using the existing remote E2E credential source; do not execute remote setup without approval.
- [x] 1.4 Run focused setup/authorization tests and record the remote reconciliation preview; leave the apply/browser proof gated on shared-system approval.
  - Preview 2026-08-01: canonical judge would deactivate 2 undeclared grants; no-assignment judge would be created. No writes were made.
- [ ] 1.5 [ADDED] Prove assigned-only visibility, unassigned denial, no-assignment copy, and pre-release result/hide disclosure with the judge-only fixture.

## 2. MYK9-6 — Bounded assigned scoresheet hydration

- [x] 2.1 Add assertion-first hook/page regressions for a completed load attempt that currently remains on the skeleton and for a cold assigned entry that hydrates successfully.
- [x] 2.2 Inventory the direct route’s trial, class, entry, dog, assignment, and authorization reads against the guarded remote fixture using read-only/intercepted browser evidence and identify the first missing layer.
  - Browser replay 2026-08-01: the explicit trial/class/entry/dog scopes hydrated the assigned scoresheet; the class-assignment read denied seeded unassigned class `...0036` before scoresheet mount. No remaining missing read layer reproduced.
- [x] 2.3 Repair the existing replication-backed hydration path and expose a recoverable Retry/Back state without changing the scoring mutation path.
- [x] 2.4 Unskip and pass the intercepted assigned-judge scoring regression, including refresh/session recovery and unassigned denial.
  - Passed at 1024x768, 1440x900, and 390x844. Refresh preserved the signed-in direct route; assigned scoring persisted to IndexedDB through an intercepted RPC; the unassigned route exposed no Save control and emitted no RPC.

## 3. MYK9-144 — Safe scheduled offline replay

- [x] 3.1 Add an audit-mode Playwright configuration/runner that can reuse an explicitly owned existing app server and fails closed on ambiguous server or target identity.
  - The audit config requires a loopback origin, matching server identity endpoint, explicit intercepted-staging declaration, and the known remote project ref. Port 5173 was correctly rejected for this run because another worktree owned it; replay used the identified server on port 5187.
- [ ] 3.2 Extend the guarded judge journey across Q/NQ, invalid/incomplete score, correction, absence/scratch, advance, class completion, and duplicate-submit protection.
  - Partial 2026-08-01: incomplete submissions remain disabled. A two-click browser stress replay reproduced two scored RPCs; `useScoresheetScoring` now uses a synchronous in-flight guard, with unit and intercepted browser proof of exactly one scored RPC. The post-save flow now offers an explicit `Correct this score` route with prefilled state and quick-advance candidates; intercepted browser replay proves Q→NQ correction, ABS recording, pulled/scratch status, explicit advance, and no premature Class complete/podium disclosure at 1024x768, 1440x900, and 390x844. The final released class-completion celebration/podium path remains open because the guarded fixture does not publish results.
- [x] 3.3 Verify offline save, restart durability, reconnect queue drain, and exactly-once guarded RPC behavior against disposable/intercepted data.
  - Browser replay 2026-08-01: tablet, desktop, and mobile assigned-judge journeys saved an NQ score offline, retained an `entries/UPDATE` mutation tagged `ringside_update_entry`, reloaded after reconnect, and drained the tested entry exactly once. A concurrent restore/upload race left a successful RPC mutation pending on desktop/mobile; `MutationManager` now serializes restore and upload and the upload runner deletes before pass-level backup. Replication unit regression covers the race. Hard reload while still disconnected remains unverified because Vite dev mode does not serve the PWA shell.
- [x] 3.4 Record traces/screenshots and proof that shared staging received no writes.
  - Audit runner used `PLAYWRIGHT_AUDIT_DATA_TARGET=shared-staging-intercepted`; all 9 judge browser cases passed after the queue fix across 1024x768, 1440x900, and 390x844. The ringside RPC guard recorded calls and fulfilled them without forwarding; no shared staging record was mutated. Failure traces from the pre-fix overlay and queue-race replays remain under ignored `apps/myk9show/test-results/audit/` for local review.

## 4. MYK9-65 — Canonical operational entry counts

- [x] 4.1 Reconcile the existing MYK9-65 plan with current main and inventory every remaining count consumer before editing.
  - Current-main inventory found the reopened recurrence in `services/database/trials/timeline.ts`: both setup/overview timeline fallbacks still trusted `classes.total_entries_count` while secretary, scoring, and ringside used entry rows.
- [x] 4.2 Add red tests for judge dashboard, stats, and check-in using the seeded class totals plus explicit cold/error states.
  - 2026-08-01: added canonical count helper tests, warm/stale snapshot tests, cold scoped-replica tests, unavailable dashboard/check-in rendering tests, and database-person-ID stats regression coverage.
- [x] 4.3 Migrate remaining count consumers to the existing show-scoped entry query/cache and compute per-class progress once per row set.
  - 2026-08-01: setup/overview show and trial timelines plus judge dashboard/check-in assignments now derive totals from canonical show-scoped entry rows in replication and PostgREST fallback paths, ignore soft-deleted entries, and fail closed when scoped entry metadata is cold. Judge stats now queries with the database person ID.
- [ ] 4.4 Verify count-to-filter agreement across Show Desk, Class Details, Class Management, Entry Management, judge surfaces, and ringside at desktop/tablet/mobile viewports.
  - Partial 2026-08-01: read-only browser replay at 1024x768, 1440x900, and 390x844 confirmed the published trial schedule, judge dashboard, check-in, and stats no longer show the stale-zero path; secretary filter matrix and merged-branch replay remain open.

## 5. MYK9-142 and MYK9-140 — Semantic and touch-safe judge actions

- [x] 5.1 Add red component tests proving entry cards expose Score/Resume semantics, keyboard activation, and independent nested controls.
  - 2026-08-01: `SortableEntryCard` tests cover named Score/Resume actions, denied scoring, exactly-once nested activation, and keyboard focus/focus-visible sizing; `DogCard` covers the injected primary-action slot.
- [x] 5.2 Convert the existing entry action to a semantic one-tap control using the current route, preflight, and mutation flow.
  - 2026-08-01: added a native button primary action with explicit `Score <dog>` / `Resume <dog>` names, 44px minimum height, propagation guards, and reuse of the existing card route handler; no scoring or mutation path changed.
- [x] 5.3 Add red size-contract tests for frequent dashboard and ringside actions, then reuse shared button sizing to meet 44px minimum / 48px tablet preference.
  - 2026-08-01: shared `Button` touch size and ringside action-menu trigger now enforce 44px mobile / 48px tablet floors; focused UI, dashboard, and header tests cover the class contract.
- [x] 5.4 Run keyboard and DOM-measurement browser replay at 1024x768, 1440x900, and 390x844 with no horizontal overflow.
  - 2026-08-01: read-only browser replay on seeded Exterior Excellent at 1024x768 and 1440x900 reached Score/Resume by Tab and activated one route with Enter; 390x844 measured 44px actions and no horizontal overflow. No score was submitted.
- [x] 5.5 [ADDED] Verify visible focus/pressed states and readable contrast in light and dark modes for every resized or semantic action.
  - 2026-08-01: browser focus checks in light/dark themes confirmed native focus, focus-visible ring classes, 44px minimum height, and contrasting foreground/background colors for the semantic action.

## 6. MYK9-143 — Human-readable judge context

- [x] 6.1 Add red rendering tests for assignments with and without ring numbers and for the class-details diagnostic ID.
  - 2026-08-01: check-in rendering covers a no-ring assignment with a UUID class id and asserts the human-readable class name is shown; class-details rendering and source contracts assert no default Class ID row.
- [x] 6.2 Replace raw UUID fallbacks with existing human-readable show, trial, ring, and class labels; move any required ID to diagnostics.
  - 2026-08-01: check-in selection now uses an internal assignment key while display labels use the ring label or class name; the default class-details popover no longer renders the raw class ID.
- [x] 6.3 Replay judge check-in and class details at tablet size and confirm no raw class UUID appears in the default workflow.
  - 2026-08-01: tablet 1024x768 browser replay showed human-readable check-in assignments and no seeded class UUID. After the trigger reliability fix, the Exterior Excellent class-details dialog opened by click, rendered status/entries/judge/time/results/check-in labels, contained no `Class ID`, and measured 304px wide with no horizontal overflow. The configured remote account still presents `Judge +1`, so single-role assigned-only authorization proof remains gated under 1.5.

## 7. Batch verification and shipping

- [ ] 7.1 Run all focused Vitest/source tests after each slice, then myK9Show typecheck and lint for the final changed file set.
- [ ] 7.2 Run `pnpm openspec validate judge-ringside-reliability-remediation --type change --strict`, focused suites, myK9Show typecheck/lint, and the broad app test/build gates appropriate to the high-risk validation profile; fix critical findings and document any bounded pre-existing failures.
- [ ] 7.3 Run code/security review for authorization, RLS/view, replication, and offline changes; preserve shared-system approval gates.
- [ ] 7.4 [EXPANDED] After each completed slice, update its Linear issue with implementation, tests, branch/PR, risk, acceptance status, and remaining proof; keep the MYK9-65 plan, QA tracker, and automation memory synchronized.
- [ ] 7.5 Commit coherent slices, open the implementation PR(s), complete required CI/review, and do not archive until every required PR is merged.
