# Plan — Per-Judge Supply Checklist

Implements OPEN-TODOS item from `## Show-Day Secretary Workflow Brainstorm`:

> Per-judge supply list (clipboards, pens, water, timer, treats jar, etc.)
> printable alongside the run-order. New schema (supply template per registry
> + per-judge overrides) and a print artifact.

This plan is intentionally written to be **read cold** by a new conversation
— it assumes no memory of the brainstorm that produced the item.

## What "ship Judge Supply Checklist" means in one paragraph

Add a single `trial_judge_supplies` table holding per-judge per-trial supply
rows. Seed the default item list from a TypeScript constant keyed by registry
(AKC, UKC, fallback) — **no `supply_templates` table in v1**, because the
template is part of the codebase, not user data. On first "Manage supplies"
open for a given (trial, judge) pair, snapshot the registry default into
rows. Secretary edits inclusion / quantity-note / sort-order / adds custom
items. Register a new `'judge-supply-checklist'` report (show scope) that
prints one page per judge listing their items. Reports menu dispatches it in
the same print batch as the existing run-order artifacts. No admin UI to
edit the default template in v1 — template changes ship as code changes.

## Out of scope (explicit, do not add)

- Admin UI to edit per-registry default templates. Templates live in TS;
  ship a new commit to change them. Adds a table only if/when real users
  ask for it.
- Per-class supplies. (Templates and overrides are per-trial-per-judge. A
  judge working three classes shares one list for that trial.)
- Global "judge preferences" across shows. Each trial gets a fresh
  snapshot. Cross-show preferences are a future feature if it turns out
  judges repeat the same overrides.
- Quantity tracking. The `note` field is free text — "2 jars", "soft
  treats only", whatever. No structured quantity column.
- Cost / inventory / procurement integration. This is a checklist, not
  inventory management.

## Source of truth (read before coding)

| File                                                                          | Why                                                                  |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `apps/myk9show/src/lib/reports/reportRegistry.ts`                             | Register the new report id, scope, sort options, component reference |
| `apps/myk9show/src/components/reports/JudgesSchedule.tsx`                     | Closest existing analog (show-scoped, per-trial-per-class)           |
| `apps/myk9show/src/components/reports/CheckInSheet.tsx`                       | Reference for per-trial layout + print CSS conventions               |
| `apps/myk9show/src/lib/reports/types.ts`                                      | `ReportProps`, `ReportDefinition`, `ReportEntry` shapes              |
| `apps/myk9show/src/features/registries/helpers.ts`                            | `getTrialRegistry(trial)` returns the registry string                |
| `supabase/migrations/192_heritage_trial_pages.sql`                            | Confirms `trials.registry_id TEXT DEFAULT 'AKC'`                     |
| `supabase/migrations/046_pipeline_dashboard.sql` (trial_checklist_state)      | Style/conventions for trial-scoped checklist tables                  |
| `supabase/migrations/005_myk9show_specific.sql` (judge_assignments)           | Canonical judge linkage: `judge_assignments.person_id`               |
| `supabase/migrations/116_myk9q_compatibility.sql` (classes.judge_name)        | Denormalized display name to use on the print artifact               |
| `apps/myk9show/src/pages/secretary/ReportsPage/` (preview + print host)       | Where the new report shows up in the menu                            |

## Pre-flight checks (run before writing the migration) [ADDED]

Per `feedback_migration_remote_state` and `feedback_db_constraint_review`,
the following must happen **before** the SQL file is created:

1. `source supabase/.env && supabase migration list --password "$SUPABASE_DB_PASSWORD"` — confirm the remote is in sync with `supabase/migrations/` and no newer file exists locally that would re-order timestamps.
2. Re-read `supabase/migrations/046_pipeline_dashboard.sql` lines 18–90 in full. The new table mirrors `trial_checklist_state` for trigger + RLS conventions.
3. Confirm the trigger function name by grepping migrations: the canonical name is **`update_updated_at_column()`** (used by `trial_checklist_state` migration 046). There is no `touch_updated_at()` function. Do not reintroduce one.
4. List recent migration filenames (`ls supabase/migrations/ | tail -10`) — confirmed convention is **`YYYYMMDDHHMMSS_description.sql`** (most recent: `20260516120000_classes_replica_identity_full.sql`). Pick the next timestamp after that.

## Schema change required (one migration) [EXPANDED]

```sql
-- supabase/migrations/<NEXT_TIMESTAMP>_create_trial_judge_supplies.sql

-- Per-trial-per-judge supply checklist rows. On first open, the app
-- snapshots the registry default template (from a TS constant, not a
-- DB table) into rows here; subsequent edits mutate these rows directly.
CREATE TABLE IF NOT EXISTS public.trial_judge_supplies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id UUID NOT NULL REFERENCES public.trials(id) ON DELETE CASCADE,
  -- person_id is the canonical link via judge_assignments. judge_name
  -- is denormalized for display + for the legacy case where a class
  -- has classes.judge_name set without a corresponding judge_assignments
  -- row.
  person_id UUID REFERENCES public.people(id) ON DELETE SET NULL,
  judge_name TEXT NOT NULL CHECK (length(judge_name) BETWEEN 1 AND 200),
  item_label TEXT NOT NULL CHECK (length(item_label) BETWEEN 1 AND 200),
  included BOOLEAN NOT NULL DEFAULT true,
  note TEXT CHECK (note IS NULL OR length(note) <= 500),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_custom BOOLEAN NOT NULL DEFAULT false,  -- true if added by secretary, false if from template
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent duplicate seeds from races. person_id may be NULL for legacy
-- judges (no judge_assignments row); the partial unique index handles
-- both shapes. [ADDED — covers gap R29]
CREATE UNIQUE INDEX IF NOT EXISTS trial_judge_supplies_unique_with_person
  ON public.trial_judge_supplies (trial_id, person_id, item_label)
  WHERE person_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS trial_judge_supplies_unique_no_person
  ON public.trial_judge_supplies (trial_id, judge_name, item_label)
  WHERE person_id IS NULL;

CREATE INDEX IF NOT EXISTS trial_judge_supplies_trial_judge_idx
  ON public.trial_judge_supplies (trial_id, person_id, sort_order);
CREATE INDEX IF NOT EXISTS trial_judge_supplies_trial_name_idx
  ON public.trial_judge_supplies (trial_id, judge_name, sort_order);

-- Trigger uses the existing update_updated_at_column() function (defined
-- in early migrations; same one used by trial_checklist_state).
-- [FIXED — was wrong function name in v1 of plan]
DROP TRIGGER IF EXISTS set_trial_judge_supplies_updated_at
  ON public.trial_judge_supplies;
CREATE TRIGGER set_trial_judge_supplies_updated_at
  BEFORE UPDATE ON public.trial_judge_supplies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.trial_judge_supplies ENABLE ROW LEVEL SECURITY;

-- RLS: mirror the lazy auth.uid() IS NOT NULL pattern used by
-- trial_checklist_state in migration 046. Any authenticated user can
-- read/write; show-scoped gating happens at the application layer via
-- the trial selection. Tighten later if real users surface multi-tenant
-- leakage. [FIXED — was TODOs in v1 of plan]
DROP POLICY IF EXISTS "trial_judge_supplies_select" ON public.trial_judge_supplies;
CREATE POLICY "trial_judge_supplies_select" ON public.trial_judge_supplies
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "trial_judge_supplies_insert" ON public.trial_judge_supplies;
CREATE POLICY "trial_judge_supplies_insert" ON public.trial_judge_supplies
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "trial_judge_supplies_update" ON public.trial_judge_supplies;
CREATE POLICY "trial_judge_supplies_update" ON public.trial_judge_supplies
  FOR UPDATE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "trial_judge_supplies_delete" ON public.trial_judge_supplies;
CREATE POLICY "trial_judge_supplies_delete" ON public.trial_judge_supplies
  FOR DELETE USING (auth.uid() IS NOT NULL);
```

**Run via the `/db-push` skill** after the migration file is written.

## File tree to add

```
apps/myk9show/src/
├── features/judge-supplies/
│   ├── templates.ts                          NEW  TS constant: { AKC: [...], UKC: [...], _default: [...] }
│   ├── useTrialJudgeSupplies.ts              NEW  React Query hook: fetch + ensure-seeded
│   ├── trialJudgeSuppliesService.ts          NEW  Supabase CRUD wrapper
│   ├── ManageJudgeSuppliesDialog.tsx         NEW  Dialog: list rows for one judge, edit/add/remove
│   ├── JudgeSuppliesSection.tsx              NEW  Trial-detail section: lists judges, "Edit" button per row
│   ├── types.ts                              NEW  Row + template TS types
│   ├── __tests__/templates.test.ts           NEW  Asserts every registry resolves to a list
│   ├── __tests__/useTrialJudgeSupplies.test.tsx NEW  Snapshot-on-first-open behavior
│   └── __tests__/ManageJudgeSuppliesDialog.test.tsx NEW  Add/edit/remove/reorder
├── components/reports/
│   ├── JudgeSupplyChecklistReport.tsx       NEW  One page per judge, lists rows where included=true
│   └── __tests__/JudgeSupplyChecklistReport.test.tsx NEW  Snapshot rendering + multi-judge layout
└── lib/reports/reportRegistry.ts             EDIT Add 'judge-supply-checklist' entry, scope=['show']
```

```
apps/myk9show/src/pages/secretary/trials/    EDIT  Add <JudgeSuppliesSection> to trial detail page
```

```
supabase/migrations/
└── <NEXT_TIMESTAMP>_create_trial_judge_supplies.sql   NEW
```

## Template content (initial seed)

This is the actual content for `templates.ts`. Refine with the user before
implementation if needed:

```typescript
export const JUDGE_SUPPLY_TEMPLATES = {
  AKC: [
    { label: 'Clipboard', sort: 10 },
    { label: 'Pens (2)', sort: 20 },
    { label: 'Highlighter', sort: 30 },
    { label: 'Stopwatch / timer', sort: 40 },
    { label: 'Bottled water', sort: 50 },
    { label: 'Hand sanitizer', sort: 60 },
    { label: 'Treats jar (judge-supplied)', sort: 70 },
    { label: 'Trash bag', sort: 80 },
    { label: 'Class rulebook', sort: 90 },
    { label: 'Judge lunch ticket', sort: 100 },
  ],
  UKC: [
    { label: 'Clipboard', sort: 10 },
    { label: 'Pens (2)', sort: 20 },
    { label: 'Stopwatch / timer', sort: 30 },
    { label: 'Bottled water', sort: 40 },
    { label: 'Hand sanitizer', sort: 50 },
    { label: 'Treats jar (judge-supplied)', sort: 60 },
    { label: 'Class rulebook', sort: 70 },
    { label: 'Judge lunch ticket', sort: 80 },
  ],
  _default: [
    // Fallback for any registry without a dedicated list. Resolves
    // to itself if registry_id is unknown.
    { label: 'Clipboard', sort: 10 },
    { label: 'Pens (2)', sort: 20 },
    { label: 'Bottled water', sort: 30 },
    { label: 'Class rulebook', sort: 40 },
  ],
} as const;
```

## Phase breakdown

### Phase 1 — Schema + service + hook (no UI)

- Write migration + apply via `/db-push`.
- `templates.ts` constant.
- `trialJudgeSuppliesService.ts` — `listForTrial(trialId)`,
  `ensureSeededForJudge(trialId, person_id, judge_name, registryId)`,
  `updateRow(id, patch)`, `addCustomRow(...)`, `deleteRow(id)`.
- `useTrialJudgeSupplies(trialId)` hook — React Query, returns rows
  grouped by `(person_id, judge_name)`.
- Tests: `templates.test.ts`, `useTrialJudgeSupplies.test.tsx`
  (snapshot-on-first-open, idempotent re-seed).

**Exit:** All Phase 1 tests pass; manual smoke via Supabase Studio
confirms RLS posture matches `trial_checklist_state`.

### Phase 2 — UI: trial-detail section + dialog [EXPANDED]

- `JudgeSuppliesSection.tsx` — section on the trial detail page that
  lists every judge assigned to the trial (via `judge_assignments` join
  + denormalized `classes.judge_name` fallback) with a row count
  ("8 items, 2 custom") and an "Edit" button.
  - **Empty state**: when the trial has zero judges (neither
    `judge_assignments` row nor any `classes.judge_name` set), render a
    quiet "No judges assigned yet — supplies appear once judges are
    added in Run Order" message with a link to the run-order page. Do
    not seed any supply rows.
- `ManageJudgeSuppliesDialog.tsx` — full edit surface for one judge:
  toggle inclusion, edit note, drag-reorder, add custom row, delete
  custom row. Template rows can be excluded but not deleted (set
  `included=false`); custom rows can be deleted.
  - **Reorder library**: use `@dnd-kit/sortable` (already in
    `apps/myk9show/package.json`). Mirror the existing class-list
    reorder pattern; do not introduce a new drag library.
  - **Loading state**: show a skeleton list while
    `ensureSeededForJudge` runs. The seed mutation is idempotent
    (`ON CONFLICT DO NOTHING`) so retries are safe.
  - **Error handling**: seed/update/delete failures surface via the
    shared `notifications.error()` toast with retry. Do not block the
    dialog — partial updates persist what succeeded.
  - **Validation**: item_label trimmed; reject empty after trim;
    reject >200 chars (matches DB CHECK). Note >500 chars rejected
    similarly. Use react-hook-form + zod consistent with neighboring
    dialogs.
- Tests: `ManageJudgeSuppliesDialog.test.tsx` covers add / toggle /
  reorder / delete-custom / cannot-delete-template paths, plus
  empty-state, seed-failure, validation-rejection paths.

**Exit:** End-to-end manual walk: open trial → see judges → edit one
judge's supplies → close → re-open → edits persisted. Verify both
empty-state (no judges) and seed-failure (network offline) paths.

### Phase 3 — Print artifact [EXPANDED]

- `JudgeSupplyChecklistReport.tsx` — show-scope report. Iterates over
  all trials in the show, then over all judges in each trial, renders
  one page per judge with `<h1>`, trial metadata, and a checklist of
  items where `included=true`, sorted by `sort_order`. Each row gets a
  printable checkbox `[ ]` on the left.
- **Data fetching strategy (performance)**: a single
  `listForShow(showId)` query joins `trial_judge_supplies` to `trials`
  by `show_id` and returns *all* rows in one round-trip. Group in JS
  by `(trial_id, person_id ?? judge_name)` rather than N+1 fetching
  per judge. Index `trial_judge_supplies_trial_judge_idx` supports the
  join. **Acceptance: print of a 4-trial × 3-judges-each show runs
  exactly one supplies query.**
- **Empty-data handling**: if a judge has zero `included=true` rows
  (everything excluded), render their page with the supplies block
  replaced by "All template items excluded — add custom items in the
  trial supplies dialog." Do not skip the page silently.
- Register in `reportRegistry.ts` with `id: 'judge-supply-checklist'`,
  `scopes: ['show']`, `category: 'operational'`, label "Judge Supply
  Checklists".
- Tests: snapshot test renders deterministic markup for a fixture
  with two trials and three judges. Add an N+1 guard test that asserts
  the supplies-fetch happens exactly once per render of the report.

**Exit:** Report appears in `/secretary/reports/...` menu under
Operational; preview renders; "Print" produces one page per judge;
single supplies query confirmed in Network panel.

### Phase 4 — Run-order page integration [EXPANDED]

- Target file: `apps/myk9show/src/pages/secretary/RunOrderPage.tsx`
  (or whichever file holds the current run-order print menu — confirm
  via `grep -rn "Print\b.*run.order\|run.order.*print" apps/myk9show/src`
  before editing).
- Add a "Print Judge Supply Checklists" menu item to the existing
  print affordance. It dispatches the `'judge-supply-checklist'`
  report id with the current show in scope, opening the same preview
  surface used by the Reports page.
- If the run-order page already has a "Print Run Order + Judge
  Sheets" combined action, extend it to include supplies. If not,
  add a discrete "Print Supply Checklists" button — do not invent a
  combined-batch UI as part of this PR (scope creep).

**Exit:** From the run-order page, "Print Supply Checklists" opens
the preview for the current show; supplies print uses the same paper
size and margins as the existing run-order print.

### Phase 5 — Testing pass + commit

- Run `pnpm typecheck` and `pnpm lint` clean.
- Run `cd apps/myk9show && pnpm vitest run src/features/judge-supplies
  src/components/reports/__tests__/JudgeSupplyChecklistReport.test.tsx`
  green.
- Ship via `/commit` skill (single PR per the
  `feedback_avoid_deferring_followups` memory).

## Risk + open questions

- **Judges without `judge_assignments` rows.** Some legacy classes
  have `classes.judge_name` set without a `judge_assignments` row.
  The trial-detail section must union both sources or judges will be
  missing. The snapshot is then keyed by `judge_name` with
  `person_id = null`. The unique key on `trial_judge_supplies` is
  `(trial_id, person_id, judge_name, item_label)` to avoid duplicate
  seeds — add this constraint to the migration if implementation hits
  duplicate-row issues.
- **Multiple judges named "John Smith" in the same trial.** Edge case
  — for v1 we trust `(person_id, judge_name)` uniqueness. If two
  judges share a name and one has no `person_id`, the secretary edits
  the wrong row. Acceptable for v1; document if a real user hits it.
- **Template changes after rows are snapshotted.** Editing
  `templates.ts` only affects new (trial, judge) pairs. Existing
  snapshots are immutable from the template's perspective. This is
  intentional: secretaries shouldn't see their hand-edited lists
  reset by a template change.
- **Reports page scope.** New report scope is `['show']`, same as
  `JudgesSchedule`. If we later want a per-trial variant, add it as
  a separate report entry rather than over-loading scopes.

## Definition of done

- [ ] Migration applied to staging; RLS verified via Supabase advisors
- [ ] All Phase 1–4 tests pass
- [ ] `pnpm typecheck` + `pnpm lint` clean
- [ ] One judge supply checklist visibly previews + prints from the
      Reports page on a real fixture (Heritage show recommended —
      `3b91e282-6e45-4a89-9446-f6ebeb0bf62c`)
- [ ] OPEN-TODOS entry "Per-judge supply checklist" marked done with
      closure trailer + plan-doc link
