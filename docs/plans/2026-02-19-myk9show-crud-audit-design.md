# myK9Show CRUD Audit — Design

**Date:** 2026-02-19
**Goal:** Systematically audit all CRUD flows in myK9Show, fix structural issues, and prepare the app for user dogfooding with minimal friction.

## Approach

Trace each domain entity's full Create → Read → Update → Delete path through code. Verify data shapes match between component → store → database at every layer. Fix issues found; flag UX/visual issues for dogfooding.

## Execution Strategy [ADDED]

**Mode:** Phased parallel using agent team. Three waves, each running agents in parallel, with phases gated so upstream fixes land before downstream audits begin.

**Phase 1** (parallel): People, Dogs, Clubs — no code overlap between these entities
**Phase 2** (parallel): Shows, Trials — benefits from any shared type fixes in Phase 1
**Phase 3** (parallel): Classes, Entries — benefits from all upstream fixes

**Per-agent cycle:**
1. Read all relevant files (pages, components, stores, hooks, types)
2. Trace each CRUD path end-to-end
3. Fix issues found
4. Report findings back to team lead

**Between phases:** Team lead runs `pnpm typecheck` to confirm fixes are clean before starting next phase.

**Final validation:** After all 3 phases complete, run `pnpm typecheck && pnpm build && pnpm lint` to confirm the full app is clean.

## Audit Order (by dependency)

| # | Entity  | Depends On          | Key Flows                                      |
|---|---------|---------------------|-------------------------------------------------|
| 1 | People  | Auth only           | Create user, list, view details, edit, delete   |
| 2 | Dogs    | People (owner)      | Add dog, list, view details, edit registrations, delete |
| 3 | Clubs   | People (members)    | Create club, list, view details, manage members, delete |
| 4 | Shows   | Clubs               | Create show (wizard), browse, view details, edit, delete |
| 5 | Trials  | Shows               | Add trial to show, view, edit, delete           |
| 6 | Classes | Trials              | Create from template, manage, edit, delete      |
| 7 | Entries | Dogs + Classes      | Register dog in class, view my entries, edit, check-in, delete |

## Per-Entity Audit Checklist

For each entity, verify:

### Data Layer
- [ ] TypeScript types match Supabase schema (column names, nullability, enums)
- [ ] Store actions (create/update/delete) send correct data shape to DB
- [ ] React Query hooks fetch with correct filters and return expected shape
- [ ] Optimistic updates don't diverge from server state
- [ ] Error handling exists for failed DB operations

### Forms
- [ ] All required fields are validated before submit
- [ ] Submit handler calls the correct store action with correct data
- [ ] Success feedback shown to user (toast, navigation, etc.)
- [ ] Error feedback shown on failure
- [ ] Form resets after successful create
- [ ] Edit form pre-populates with existing data

### List/Read Views
- [ ] List page loads data and renders items
- [ ] Empty state shown when no items exist
- [ ] Detail view loads correct item by route param
- [ ] Navigation between list and detail works
- [ ] Loading states shown during data fetch

### Delete
- [ ] Confirmation dialog before delete
- [ ] Correct item deleted (not wrong ID)
- [ ] UI updates after deletion (redirect, remove from list)
- [ ] Related data handled (cascade or prevent)

### Navigation
- [ ] Routes defined and accessible from sidebar/nav
- [ ] Role-based access enforced (secretary vs exhibitor vs admin)
- [ ] Breadcrumbs or back-navigation work

## What Gets Fixed vs Flagged

### Fix immediately
- Broken data flow (wrong field names, missing transforms)
- Missing error handling (silent failures)
- Dead code paths (buttons wired to no-ops)
- Type mismatches between layers
- Missing navigation links or broken routes
- Stale patterns (direct Supabase bypassing stores)

### Flag for dogfooding
- Visual layout and spacing issues
- UX flow preferences (e.g., "should this be a dialog or a page?")
- Whether Supabase queries return correct data with real records
- Auth/permission edge cases with real user sessions
- Performance with real data volumes

## Commit Strategy [ADDED]

One commit per phase after all agents in that phase complete and typecheck passes. Commit message format: `fix(myk9show): audit <entities> CRUD flows`. This keeps changes reviewable and revertable per phase.

## Audit Report Format [ADDED]

Written to `docs/plans/2026-02-19-myk9show-crud-audit-report.md` as work progresses. Structure:

```markdown
## <Entity Name>

### Issues Found & Fixed
- [file:line] Description of issue → what was changed

### Issues Flagged for Dogfooding
- Description of issue (needs manual verification with real data/session)

### Checklist Status
- [x] Data layer verified
- [x] Forms verified
- [x] List/Read verified
- [x] Delete verified
- [x] Navigation verified
```

## Deliverables

1. **Fixes committed** — one commit per entity after typecheck passes
2. **Audit report** — `docs/plans/2026-02-19-myk9show-crud-audit-report.md` with findings per entity
3. **Dogfooding checklist** — embedded in the audit report, organized by entity, listing what needs manual verification
