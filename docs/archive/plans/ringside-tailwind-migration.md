# Plan: Migrate `@myk9/ringside` visual layer to Tailwind (drop myK9Q styling)

## Decision & context

The platform is converging on **myK9Show + Tailwind** as the single go-forward
app. myK9Q is being retired; its "Semantic CSS / no Tailwind" rule is now a
stale, sunset-era constraint. The owner accepts that myK9Q's *rendered* ringside
views lose styling (it's effectively unused). myK9Q's **non-visual** imports from
`@myk9/ringside` (stores, utils, hooks, types — most of its 43 import sites) are
unaffected because they import logic, not styles.

Goal: replace the scoped semantic stylesheet `packages/ringside/src/styles/ringside.css`
(599 lines, `.ringside-root`-scoped) with **Tailwind utilities authored directly
on the ringside components**, so the entire myK9Show surface uses one styling
system. The live scoresheets (`@myk9/scoring-ui`) are already Tailwind — out of scope.

## Non-negotiable: preserve the behaviors fixed in #432/#433

These were hard-won; the migration must not regress them:
- Accent-following: armband / active states use `--primary` (Tailwind `bg-primary` / `text-primary-foreground`).
- Dark mode: colors inherit the host theme (Tailwind tokens already are light/dark aware in myK9Show).
- In-ring card: bold left bar + soft glow (no full-perimeter outline).
- Sticky header at a *raised* (not modal) z-index; card list `isolation: isolate`; host Sheet/Popover (z-50) layer above.
- Actions dropdown-menu styled as a solid card (was the ported CSS).
- Solid accent-square armbands (already done in components for scoresheets; ringside DogCard armband `.ringside-armband` must match).

## Known hard spots
1. **Status / section colors** (`--status-checked-in`, `--status-in-ring`, …) are
   custom tokens, not Tailwind palette entries. Options: (a) keep these few CSS
   custom properties defined on a wrapper and reference via arbitrary values
   (`bg-[var(--status-checked-in)]`, `border-l-[3px] border-[var(--status-in-ring)]`),
   or (b) add a `ringside` color group to `tailwind.config.js` theme. Prefer (b)
   for readability; the values are mode-independent semantics.
2. **Conditional status classes** (`dog-card.in-ring`, `status-badge.checked-in`)
   become conditional Tailwind strings via `cn()` keyed on status — a small
   status→classes map per component.
3. **`color-mix()` glow / arbitrary radii** (in-ring shadow, `border-radius: 1rem`
   armband) → Tailwind arbitrary values (`shadow-[...]`, `rounded-2xl`).
4. **`.ringside-root` scoping** is no longer needed once styles are utilities;
   drop the wrapper (or keep as an inert grouping div). Confirm nothing else keys
   off it.

## Phases (each its own Codex-reviewed PR)

### Phase A — Inventory & theme prep
- Enumerate every component consuming a `ringside.css` class (grep the kebab
  classNames). Produce a class→Tailwind mapping table.
- Add the `ringside` status color group + any needed tokens to
  `apps/myk9show/tailwind.config.js` theme (mode-independent).
- No component edits yet. **Test:** build + typecheck clean.

### Phase B — DogCard + status/section badges
- Migrate `DogCard.tsx` (+ `SortableEntryCard*`) and the status/section badge
  markup to Tailwind utilities; delete the corresponding `ringside.css` blocks.
- **Test:** unit tests for status→class mapping; browser parity (light+dark,
  every status: none/checked-in/at-gate/in-ring/conflict/pulled/scored/placements/results)
  vs pre-migration screenshots.

### Phase C — EntryList container + header + actions menu + dialogs
- Migrate `EntryListPage`, `CombinedEntryListPage`, `EntryListHeader`,
  `entryListHeaderHelpers` (actions menu), dialogs, ClassList cards.
- Re-implement: sticky header (raised z), `isolation: isolate` on the list,
  actions dropdown card, filter-panel stacking.
- Delete remaining `ringside.css`; remove its import; drop `.ringside-root` if inert.
- **Test:** browser parity at 375px — header at top, dropdown readable + above
  badges, filter Sheet above header, in-ring border; at-show suites green.

### Phase D — Cleanup & docs
- Update `CLAUDE.md`: remove "no Tailwind in myK9Q" as a live rule; state the
  target is Tailwind-everywhere and `@myk9/ringside` is Tailwind-native.
- Update memory notes (app-boundary / sunset).
- Confirm no `ringside.css` references remain anywhere (grep app + docs).

## Verification strategy
- Reuse the static parity harness (`packages/ringside/dist/styles/index.html`
  equivalent) + live myK9Show `/at-show` browser checks in **light and dark** at
  mobile width, screenshot-compared against the current (stable) look before each
  phase merges.
- Full `pnpm typecheck`; `@myk9/scoring-ui` + at-show test suites green per phase.

## Phase A findings (complete)

**Theme prep already exists — no `tailwind.config.js` change needed.** myK9Show
defines `--status-*` in `src/pages/scoring/styles/design-tokens.css` with **light
AND dark** values (e.g. `--status-in-ring` `#2563eb` light / `#3b82f6` dark), and
`tailwind.config.js` already exposes them as a `status` color group. So
`bg-status-in-ring`, `border-status-checked-in`, `text-status-*`, etc. are already
light/dark-aware utilities. Phase A is therefore **docs-only**.

**Only gaps (handle in Phase B when migrating dog-card borders):**
- Result borders: qualified `#14b8a6` → reuse `border-status-checked-in` (same hex)
  or `border-status-completed`; NQ/EX `#dc2626` → `border-red-600`; ABS/WD `#7c3aed`
  → `border-violet-600`.
- Placement medals: gold `#ffd700` / silver `#c0c0c0` / bronze `#cd7f32` → arbitrary
  values `border-[#ffd700]` etc. (or a tiny `place` theme group if preferred).

### Class → Tailwind mapping (source: every selector in `ringside.css`)

**Phase B — DogCard + badges**
- `.dog-card` → `relative flex min-h-[70px] flex-col overflow-hidden rounded-2xl border border-border bg-card p-3 shadow-sm transition-[transform,box-shadow,border-color] duration-200`
- `.dog-card.touchable` → `cursor-pointer hover:-translate-y-0.5 hover:shadow-lg hover:border-primary/30 active:scale-[0.98]`
- `.dog-card-content` → `relative flex items-start gap-3`
- `.dog-card-details` → `min-w-0 flex-1 pr-2`
- `.dog-card-name` → `mb-1 text-base font-[590] leading-snug tracking-tight text-foreground`
- `.dog-card-breed` → `mb-0.5 text-sm font-medium text-muted-foreground`
- `.dog-card-handler` → `text-xs font-medium text-muted-foreground`
- `.ringside-armband` → `flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-white/20 bg-primary text-lg font-bold text-primary-foreground shadow-md` (`.is-long` → `text-[0.9375rem]`)
- `.dog-card-drag-handle` → `flex shrink-0 cursor-grab items-center justify-center self-center rounded-sm p-0.5 text-muted-foreground active:cursor-grabbing active:text-primary`
- status border-left modifiers → `border-l-[3px]` + `border-l-status-*` (checked-in/conflict/pulled/at-gate/come-to-gate/completed[scored])
- `.dog-card.in-ring` → `border-l-[5px] border-l-status-in-ring shadow-[0_2px_12px_color-mix(in_srgb,var(--status-in-ring)_22%,transparent)] bg-gradient-to-r from-[color-mix(in_srgb,var(--status-in-ring)_6%,transparent)] from-0% to-transparent to-[45%]`
- placements → `border-l-[3px] border-l-[#ffd700|#c0c0c0|#cd7f32]`; results → `border-l-[3px] border-l-status-checked-in|border-red-600|border-violet-600`
- `.status-badge` → `relative inline-flex min-h-9 max-w-[140px] cursor-pointer items-center justify-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap rounded-bl-lg px-3 py-1 text-xs font-semibold leading-tight tracking-wider transition hover:not-disabled:-translate-y-px` + per-status `bg-status-* text-white` (`.disabled` → `bg-muted text-muted-foreground opacity-60 cursor-not-allowed`)
- `.status-icon`/`.status-text` → `inline-flex h-[1.125rem] w-[1.125rem] items-center justify-center` / `min-w-0 overflow-hidden text-ellipsis text-[0.6875rem] normal-case`
- `.section-badge` → `absolute bottom-0 left-0 z-10 flex items-center justify-center rounded-bl-2xl rounded-tr-lg px-3 py-1 text-xs font-semibold text-white` (`.section-a` `bg-[#9ca3af]`, `.section-b` `bg-[#4b5563]`)
- `.result-badge` → `rounded-md px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide`

**Phase C — layout / header / menu**
- `.entry-list-container` → `p-3`; `.entry-list-content` → `pb-8 pt-2`; `.entry-list-scrollable` → `isolate`
- `.grid-responsive` → `grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 lg:gap-5`
- `.loading`/`.empty-state` → `flex flex-col items-center justify-center gap-2 px-3 py-8 text-center text-muted-foreground`; `.empty-state-title` → `text-lg font-semibold text-foreground`
- `.page-header` → `sticky top-0 z-10 flex min-h-[60px] items-center gap-4 rounded-b-xl border-b border-border bg-card p-3`
- `.class-info` → `absolute left-1/2 top-1/2 flex max-w-[55%] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 text-center`
- `.class-info-clickable` → `cursor-pointer rounded-md px-1.5 py-0.5 transition-colors hover:bg-accent`
- `.class-name` → `m-0 whitespace-nowrap text-lg font-[590] leading-none tracking-tight text-foreground`
- `.info-indicator` → `inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-muted-foreground text-card opacity-60`
- `.header-buttons` → `relative z-[100] ml-auto flex shrink-0 items-center gap-2`
- `.trial-meta-text` → `text-xs font-medium leading-tight text-muted-foreground`
- `.actions-dropdown-menu` → `absolute right-0 top-[calc(100%+0.5rem)] z-[100] mr-1 max-w-[calc(100vw-2rem)] min-w-[220px] overflow-hidden rounded-xl border border-border bg-card shadow-lg`
- `.action-menu-item` → `flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-foreground transition-colors hover:bg-muted active:bg-input disabled:cursor-not-allowed disabled:opacity-50`
- `.menu-divider` → `my-1 h-px bg-border`
- `.ringside-root` → drop (utilities are self-scoping); confirm nothing else keys off it before removing the wrapper.

## Risk & rollback
- Each phase is an independent PR behind the existing OFF-by-default at-show flag;
  if a phase regresses parity, revert that single PR.
- Biggest risk is silent dark-mode / stacking regressions — mitigated by the
  per-phase screenshot comparison against the #432/#433 baseline.
