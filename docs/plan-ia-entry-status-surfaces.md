# Plan: Consolidate Entry-Status Display Logic

> **Status:** Active

Remediation plan for [`docs/ia-review-entry-status-surfaces.md`](ia-review-entry-status-surfaces.md). The IA review found the three entry surfaces (exhibitor cross-show page, exhibitor single-show tab, secretary management) are **deliberate and should stay**, but the same four display facts — status label, class section, refund, class title — are computed in **4+ independent mappers across two incompatible status enums**. That fragmentation caused the 2026-06-18 walk divergence ("withdrawn" vs "Upcoming", phantom "Section A"). This plan collapses the display logic to a single source so the surfaces cannot disagree.

**Goal:** one pure `getEntryDisplay()` selector is the *only* place per-entry display facts are derived. Every surface renders through it.

**Non-goal:** deleting or merging any of the three surfaces (they are intentional per CLAUDE.md / INTENT.md). Phase C only *considers* the page-vs-tab scope question.

## Guardrails

- **Offline-first (CLAUDE.md "Offline-first data"):** the selector is a **pure function of already-fetched replication-row fields**. It must NOT call `supabase.from` or any async read — that would break the offline path for `/exhibitor/entries` and the My Entries tab (both replication-first, PostgREST only as fallback). No hooks inside it.
- **Canonical status domain:** the selector operates on the raw `entry-lifecycle` `EntryStatus` union, NOT the UI `show-registration-types` `EntryStatus` enum. The dual-domain mismatch (`mapEntryStatus` folding `withdrawn`+`cancelled`) is the bug; do not preserve it.
- **Assertion-first (CLAUDE.md Testing):** for each status→label / refund mapping, write the `expect(getEntryDisplay(row)).toEqual(...)` line first and run it red before moving the logic.
- **Pre-launch, no users:** no backwards-compat shims for the old mappers — delete them in the same sweep.
- **[ADDED] Robust to partial rows:** the selector is handed replication rows that may be mid-sync — null/absent class join, null `entry_status`, null `payment_status`. It must return a defined, safe display for every such case (e.g. missing class → empty title + neutral status, never a terminal-label fall-through). A row with no class join must NOT silently render "Upcoming"/"Scratched" — that is the exact fall-through this work removes.
- **[ADDED] Display-only, not role-gating:** the selector returns presentation strings + a machine-readable `statusKind`. It must NOT decide *which role may see which field* — refund notes, internal status, and other role-scoped data stay gated at the surface and by RLS. The same `getEntryDisplay(row)` output is safe to compute everywhere; the *caller* chooses what to show.

---

## Phase A — Extract the shared selector + migrate the 3 core hooks

**Entry trigger:** plan approved.

1. Create `apps/myk9show/src/services/entryDisplay/entryDisplaySelectors.ts` exporting a pure
   `getEntryDisplay(row): { statusLabel, statusKind, classTitle, section, refundLabel }`.
   - Input = canonical fields already present on a replication row: `entry_status` (canonical union), `payment_status`, `refund_amount`, `refunded_at`, class `{ element, level, section, name }`, trial date, `hasResult`.
   - Status label: one `switch` over the canonical union — folds in today's `mapEntryStatus`, both `getEntryStatusBadge` copies, and `getRemovedStateLabel`/`getPendingResultLabel`. Every canonical status (including `cancelled`, `moved`, `move-up-requested`) maps explicitly; no fall-through to "Upcoming" for terminal states.
   - Section: the single `section ?? ''` default (kills the phantom-"A" class structurally).
   - Refund: **prefer explicit `refund_amount`/`refunded_at`**; only fall back to `payment_status` inference when columns are absent. `partial_refund` handled explicitly.
   - Class title: one composition rule (decide: stored `name` vs composed `element+level+section` — match what exhibitors expect; document the choice in the module header).
2. Migrate the three core hooks to call it instead of mapping inline:
   - `useMyEntriesData` (`pages/MyEntriesPage/modules/`)
   - `useShowEntriesForUser` (`hooks/`)
   - `useEntryManagementData` (`pages/secretary/` / `utils/entryManagementUtils.ts`)
3. Leave the old mappers in place *only* if still referenced by un-migrated sites; mark them `@deprecated` pointing at the selector.

### Phase A — Tests (required)
- Unit tests for `getEntryDisplay`: one case per status (`confirmed`, `submitted`, `withdrawn`, `scratched`, `not_accepted`, `cancelled`, `moved`, `move-up-requested`, `completed`) asserting an identical `statusLabel` regardless of caller.
- Section: `null → ''`, `'A' → 'A'`, `'B' → 'B'`.
- Refund: `refunded` + `refund_amount=30 → "Refunded $30"`; `partial_refund` + amount; `payment_status='refunded'` with no column → inferred label.
- Regression pin: the walk fixture (Ranger / Exterior Excellent, withdrawn+refunded) yields **the same** `statusLabel`+`refundLabel` for all three hook inputs.
- **[ADDED] Malformed/partial input:** null/absent class join → defined safe output (empty title, neutral status, **no** terminal-label fall-through); null `entry_status`; null `payment_status`. These assert the cold-store row never mis-renders as a terminal state.
- **[ADDED] Class-title pin:** one test fixes the chosen composition rule (stored `name` vs composed `element+level+section`) so the decision can't silently drift back into a divergence source.
- **[ADDED] Surface regression:** the existing `MyEntriesPage` / `MyEntriesTab` / Entry Management tests still pass; add (if absent) one render assertion per surface that the walk fixture shows the selector's `statusLabel`. Rebuild any edited `packages/*` before running app tests (built-dist gotcha).

**Exit criterion:** the three core surfaces render via `getEntryDisplay`; the tests above pass; a `withdrawn`/`cancelled`/`moved` row, a `partial_refund` row, and a **class-less cold-store** row each produce identical, safe labels across all three.

> **[ADDED] As built (Phase A PR):** the selector (`getEntryStatusKind`/`isRemovedStatus`/`getRemovedStatusLabel`/`getRefundLabel`/`resolveClassSection`/`composeClassTitle`/`getEntryDisplay`) shipped with 37 unit tests. Migrated the two **safe** divergence sites: the tab's `getRemovedStateLabel` (removal classification + refund now via the selector — fixes the legacy `cancelled`→"Upcoming" fall-through) and the tab-path section default (`classMappers` + `useShowEntriesForUser` → `resolveClassSection`). **Deferred to Phase B:** routing `mapEntryStatus` (page + secretary) and class-title composition through the selector — because `entry_status='paid'` is a **real persisted value** (in the `entry_status` CHECK constraint, written by `entryRegistrationStore`) that legacy `mapEntryStatus` maps to `PENDING` while the canonical classifier maps to `accepted`/`ACCEPTED`. Moving a paid entry from the "Pending / needs review" bucket to "Accepted" is a **product decision** (it shifts a secretary stat), not a silent refactor — Phase B makes that call explicitly (and aligns `promotion-expired` likewise). The remaining 3 section sites (`atShowDataAdapter` ×2, `reportDataMapping`) are also Phase B sweep.

---

## Phase B — Sweep the remaining render sites + delete the duplicates

**Entry trigger:** Phase A merged.

> **[ADDED] Interim window:** after Phase A only the three core surfaces are unified; the remaining ~22 sites still map independently, so cross-surface divergence is only *fully* closed when Phase B lands. Treat A→B as one sprint, not two loosely-coupled efforts, so the gap window stays short.

1. Migrate the ~22 remaining entry-state render sites (At-Show pages, Trial entries table, TV display, dog activity, move-up/pull/waitlist tabs, entry receipt/edit dialogs, scoring/results cards — full list via grep) onto `getEntryDisplay`.
2. Delete the now-dead duplicates: the second `getEntryStatusBadge`, the dual-domain `mapEntryStatus` (or reduce it to a thin re-export of the selector's `statusKind`), and the per-mapper section defaults once nothing else reads them. **[EXPANDED] Migrate the enum consumers, not just the labels:** anything keyed on the UI `EntryStatus` enum — the My Entries page status **filters** (`all`/`pending`/`accepted`/`waitlist`/`upcoming`/`completed`) and badge **styling** — must move to the selector's machine-readable `statusKind`, or filtering/coloring silently breaks while labels look fine. Audit every `EntryStatus.` reference before deleting `mapEntryStatus`.
3. Update any source-text/unit tests that pinned the old mappers (grep `mapEntryStatus`, `getEntryStatusBadge`, `getRemovedStateLabel`).

### Phase B — Tests (required)
- A guard test (source-text or import-graph) asserting entry status/section/refund are mapped **only** inside `services/entryDisplay/` — fails if a new independent mapper appears.
- Rebuild any edited `packages/*` before running app tests (built-dist gotcha).

**Exit criterion:** `grep` for independent status/section/refund derivation returns only the selector module; full test suite + `pnpm typecheck` green.

### Phase B — outcome (implemented)

- **`mapEntryStatus`** is now a re-export from `services/entryDisplay/entryStatusUiAdapter.ts`, a thin kind→UI-`EntryStatus` adapter built on `getEntryStatusKind`. **Owner decision (2026-06-18):** `entry_status='paid'` and `'promotion-expired'` are special-cased to stay `PENDING` (the secretary's "needs review" lane) rather than the classifier's `accepted`/`not_accepted` — payment ≠ acceptance. The one intentional change from the old switch: the underscore `move_up_requested` spelling now resolves like its hyphen twin.
- **`getEntryStatusClasses` + `mapClassEntryStatus`** rebuilt to `switch` on the classifier KIND (no parallel raw switch).
- **Section sweep:** `reportDataMapping.ts` (2 sites) + `atShowDataAdapter.ts` (`buildClassName` → `composeClassTitle`, 2 section defaults) onto `resolveClassSection`, which now also folds the at-show `'-'` "no section" sentinel and blanks to `''`.
- **Enum consumers** (My Entries filters/predicates/badges, secretary stats) ride the single projection rather than being rewired to raw `statusKind` — keying the badge off the raw kind would re-diverge from the `paid→PENDING` filter. Audited every `EntryStatus.` reference; none classify raw independently anymore.
- **Deliberately left** (different/finer status domains, not the divergent surfaces): `useClassEntries.mapEntryStatus` (finer live `at_gate`/`checked_in`), the scoring mappers (scoring domain; `scoringMappers` only validates the canonical value), `entryStatusUtils` (show-availability domain), and payment-status counters (metrics, not labels).
- **The two same-named `getEntryStatusBadge`** are kept — they are per-surface voice layers ("Pulled/Not Accepted" vs "Pending Review/Rejected"+`isPastShow`), not redundant logic; both now consume the unified projection.
- **Guard:** `entryStatusClassifierGuard.test.ts` fails if `'promotion-expired'`/`'move-up-requested'` are classified (case/`===`) outside `services/entryDisplay/`.

---

## Phase C *(optional)* — Page-vs-tab scope decision

**Entry trigger:** owner decision (F5 is Medium, not blocking).

The exhibitor **My Entries tab** (single-show, "where to be") overlaps the **My Entries page** (cross-show, "manage + pay") in data but not intent. Decide one of:
- **Keep both** as distinct intents (status quo) — document why in INTENT.md.
- **Collapse the tab to a summary** that deep-links to `/exhibitor/entries?show=<id>` (CLAUDE.md "fast path = link, not new UI"), removing the second full render.

No code until the owner picks. If "collapse," it becomes its own small plan.

---

## Sequencing

```
Phase A (selector + 3 hooks + tests)  ──→  Phase B (sweep + delete + guard test)  ──→  Phase C (optional, owner-gated)
```

A is the foundation (resolves F1–F4 for the surfaces that actually disagreed). B makes the invariant repo-wide and un-revertable. C is a separate UX judgment call.

**Estimated effort:** A = 1 PR · B = 2–3 PRs · C = 0–1 PR.
