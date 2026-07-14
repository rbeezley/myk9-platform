# Remove the `unified_ringside_enabled` feature flag

> **Status:** Complete — archived 2026-07-12 (flag removed pre-launch, PR #947; migration `20260623120000_remove_unified_ringside_flag` applied; `atShowFeatureFlag.ts` gone; only `AtShowAccessGate` remains — remaining `unified_ringside_enabled` hits in src are historical comments).

## Why

Pre-launch, no real users (see auto-memory `project_prelaunch_no_users`). The
`/at-show` ringside surface has been gated per-show behind
`shows.unified_ringside_enabled` since Phase 1e (migration `20260529120000`).
That gate is now the sole blocker on a cluster of documentation/training tasks
(OPEN-TODOS items: "Ringside quickstart — draft", "Capture J-01…J-06 +
`at-show-access-paths` diagram", and the `qa-draft → verified` promotion) — every
J-shot is `blocked: flag` because staging shows render the inline "not enabled"
notice instead of the real surface.

Decision (2026-06-23, owner): promote the surface unconditionally now and finish
polishing it before launch, rather than carry the flag. **Option C — full
removal, including the DB objects.**

## Scope boundary — what STAYS

`/at-show` has **two** independent gates (auto-memory `project_atshow_gating_map`):

| Gate | Question | Action |
| --- | --- | --- |
| `UnifiedRingsideGate` (this flag) | "Is the ringside feature turned on for this show?" | **REMOVE** |
| `AtShowAccessGate` | "Is this user allowed in (role / passcode grant)?" | **KEEP — untouched** |

Removing the flag means every show exposes the ringside surface; access control
is unchanged. The "no dead ends" INTENT (`docs/INTENT.md` L119) must be
preserved — a missing/unloadable show must still explain itself, not 404.

## Phases

### Phase 1 — Frontend code
- [ ] Delete `apps/myk9show/src/features/at-show/atShowFeatureFlag.ts` (both
      `isUnifiedRingsideDevOverride` and `resolveUnifiedRingsideEnabled` become
      dead).
- [ ] Convert `UnifiedRingsideGate.tsx` → a flag-free resilience boundary
      (rename to `RingsideShowBoundary.tsx`). Keep the loading spinner,
      error+retry, and missing-show "back to dashboard" notice (preserves "no
      dead ends"); drop the `devOverride` short-circuit and the
      `resolveUnifiedRingsideEnabled` branch. A successfully-loaded show now
      always renders children.
- [ ] `atShowRoutes.tsx` — swap the `UnifiedRingsideGate` wrapper for
      `RingsideShowBoundary`; update the header comment.
- [ ] `ReplicatedShowsTable.ts` — drop the `unifiedRingsideEnabled` field from
      the `ReplicatedShow` type + the `rowToShow` mapper (no longer read).
- [ ] `AtShowEntryListPage.tsx` — update the stale header docstring (lines 22-26)
      that references `UnifiedRingsideGate` / `atShowFeatureFlag.ts`.

### Phase 2 — Database (migration + types + seed)
- [ ] Run `supabase migration list` first (memory `feedback_migration_remote_state`).
- [ ] New migration `NNN_remove_unified_ringside_flag.sql`:
  - `ALTER TABLE public.shows DROP COLUMN IF EXISTS unified_ringside_enabled;`
  - `DROP TABLE IF EXISTS public.unified_ringside_overrides;` (cascades its
    policies + trigger)
  - `DROP FUNCTION IF EXISTS public.unified_ringside_overrides_guard_created_by();`
- [ ] `seed-demo.sql` — remove `unified_ringside_enabled` from the `shows`
      column list (~L230) and its value (~L260).
- [ ] Regenerate / hand-edit `packages/supabase/src/types/database.types.ts` —
      remove the column from `shows` Row/Insert/Update and delete the whole
      `unified_ringside_overrides` table type block.
- [ ] **Gated:** `supabase db push` is a shared-system write — confirm with owner
      before pushing (Auto Mode rule). Migration authored this session, pushed on
      confirmation.

### Phase 3 — Tests
- [ ] Delete `atShowFeatureFlag.test.ts`.
- [ ] Rewrite `UnifiedRingsideGate.test.tsx` → `RingsideShowBoundary.test.tsx`:
      drop the dev-override + flag-off cases; keep/extend loading, error+retry,
      missing-show, and happy-path-renders-children.
- [ ] `AtShowEntryListPage.test.tsx` — update the comment referencing the gate.
- [ ] `pnpm --filter @myk9/myk9show test` for the at-show feature dir green;
      `pnpm typecheck` clean (memory `feedback_use_pnpm_typecheck`).

### Phase 4 — Docs unblock
- [ ] Flip `blocked: flag` → `ready` in the screenshot shot-list
      (`docs/training/screenshot-shot-list.md`,
      `.claude/skills/screenshot-docs/references/shot-list.md`) for J-01…J-06 +
      `at-show-access-paths`.
- [ ] Update guide/training/diagram outlines that name the flag as a blocker
      (judge-steward-quickstart-outline, secretary-guide-outline,
      role-based-deck-outlines, myk9show-overview-deck-outline, diagrams/README,
      guide-authoring, show-day-triage-outline,
      secretary-golden-path-checklist — the "DEV-only" / "blocked until flag
      promoted" notes).
- [ ] `OPEN-TODOS.md` — unblock items 6 & 7 (Ringside quickstart draft + J-shot
      capture); note the gate removal so the `qa-draft → verified` chain can
      proceed.

## Out of scope / follow-on
- Capturing the actual J-01…J-06 screenshots + drafting the quickstart — this
  plan *unblocks* those; the capture work is its own session against staging
  once the migration is pushed.
- The separate `AtShowAccessGate` passcode/role flow is untouched.

## Progress — 2026-06-23

- **Phase 1 (frontend) — DONE.** `atShowFeatureFlag.ts` + `UnifiedRingsideGate.tsx`
  deleted; `RingsideShowBoundary.tsx` added (flag-free loading/retry/missing-show);
  `atShowRoutes.tsx`, `ReplicatedShowsTable.ts`, `AtShowEntryListPage.tsx` rewired.
- **Phase 2 (DB) — AUTHORED, push PENDING (gated).** Migration
  `20260623120000_remove_unified_ringside_flag.sql` written; `seed-demo.sql` +
  `database.types.ts` updated. `supabase db push` held for owner confirmation.
  **Note:** the docs unblock on the *code* deploy, not the push — the surface
  renders for every show as soon as `RingsideShowBoundary` ships; the migration
  only drops the now-unused column/table.
- **Phase 3 (tests) — DONE.** `RingsideShowBoundary.test.tsx` (6 cases) replaces
  the gate test; at-show dir green (25 files / 153 tests); `pnpm typecheck` clean;
  changed files lint clean (`--max-warnings 0`).
- **Phase 4 (docs) — DONE.** Shot-lists flipped `blocked: flag` → `ready`;
  OPEN-TODOS items 6 & 7 unblocked; 8 guide/training/checklist/diagram files'
  flag-blocker prose updated.

## Testing gate
Phase not complete until: at-show feature tests pass, `pnpm typecheck` clean,
and the migration applies cleanly (dry-run) before push.
