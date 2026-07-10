# Tasks: exhibitor-my-shows-elderly-ux-remediation

## 1. Pure helpers first (assertion-first tests)

- [x] 1.1 Grep for pinned strings before editing ("Please check your connection", "Browse All Shows", "Current Entries", "My Entries") across src and tests to inventory source-text regression tests that must be updated in the same commit
- [x] 1.2 Write failing unit tests for `deriveEntryNextAction(entry)` covering precedence: finish payment > check-in eligible > view show, plus paid+no-eligible-class and past-entry cases
- [x] 1.3 Implement `deriveEntryNextAction` in `apps/myk9show/src/pages/MyEntriesPage/modules/` (pure, typed against the existing entry shape); tests green
- [x] 1.4 Write failing unit tests for `EMPTY_STATE_BY_TAB` lookup (all six tabs: heading, body, CTA; Pending includes secretary-review reassurance; Waitlist explains waitlisting; Completed points to Upcoming)
- [x] 1.5 Implement `EMPTY_STATE_BY_TAB`; tests green
- [x] 1.6 Write tests pinning the visible scope-label strings ("Current entries" qualifier and "All entries" / includes-past note) and the offline-first error copy

## 2. Counts, stats row, and fees tile

- [x] 2.1 Update `CompactStatsRow.tsx`: rename the current-entries card label to current-scope wording with upcoming/in-review qualifier; add trailing `ChevronRight` (aria-hidden) to all clickable cards; preserve the `exhibitor-count-integrity` INTENT comment
- [x] 2.2 Update the entries-section eyebrow in `MyEntriesPage/index.tsx` to "All entries" plus a visible "Includes past shows" note
- [x] 2.3 Fees tile: when shared amount-due derivation is $0, render muted "Paid in full" linking to My Payments (no large $ total); positive due keeps prominent amount and existing cart/recovery href — do NOT recompute amount due
- [x] 2.4 Update/extend CompactStatsRow unit tests for labels, chevron, and both fee states

## 3. Entry card progressive disclosure

- [x] 3.1 Refactor `MyEntryCard.tsx` into summary band (status, dog+armband, show date, location/directions, single next action from `deriveEntryNextAction`) + `Show details` collapsible (class rows, confirmation number, results, per-class check-in controls); the toggle carries `aria-expanded`/`aria-controls` and a ≥44px hit area [ADDED a11y]
- [x] 3.1b Pending-review entries show a one-line reassurance subtext on the status ("The show secretary is reviewing this entry") in the summary band [ADDED]
- [x] 3.2 Wire summary-band check-in action to the existing check-in mutation path (reuse the same handler; no duplicate write path)
- [x] 3.3 Show "Entries close" in summary only while editing is still possible; move it into details afterward
- [x] 3.4 Directions link: add `min-h-[44px]` interactive area; keep external-link semantics and aria-label
- [x] 3.5 Update MyEntryCard tests: collapsed-by-default rendering, details toggle, next-action per state, check-in called with same args as before (assertion-first for the mutation call)

## 4. Page shell, filters, header

- [x] 4.1 Make the `My Shows` h1 visible on all viewports (remove `sr-only`), keeping heading order; adjust greeting layout
- [x] 4.2 "Enter a Show" CTA: raise from `size="sm"` to ≥44px height; sidebar close control to ≥44px
- [x] 4.3 `PrimaryTabs.tsx`: prevent label illegibility at 390px (min-width per trigger, strip scrolls) and add a visible overflow edge cue; apply the same cue pattern to the dog strip
- [x] 4.4 Swap the generic EmptyState for `EMPTY_STATE_BY_TAB`-driven rendering; replace error copy with the offline-first phrasing (Retry unchanged)
- [x] 4.5 `AppHeader.tsx`: at <md widths move theme toggle and AskQ assistant into the existing account dropdown as labeled items; hide their standalone icons on phone only; desktop unchanged; add/update header tests
- [x] 4.6 Typography pass: bump primary-reading muted copy sizes/contrast per design (component-level classes only, no global token edits); verify both dark and light themes
- [x] 4.7 Extract empty/error states, tab defs, and section scaffolding from `MyEntriesPage/index.tsx` into sibling modules so the file is under 500 lines with behavior unchanged

## 5. Verification

- [x] 5.1 `pnpm typecheck` clean (clear stale tsbuildinfo if new files were added) — forced turbo run + fresh non-incremental `tsc --noEmit` both clean
- [x] 5.2 `cd apps/myk9show && npx vitest run src/pages/MyEntriesPage src/components/exhibitor src/components/common/PrimaryTabs* src/components/layout` (plus any relocated test paths) — all green (365 tests, 36 files)
- [x] 5.3 `pnpm lint` clean (watch react-hooks/set-state-in-effect and max-warnings 0)
- [x] 5.4 Manual/preview walk at 390px phone, 834px tablet portrait, and desktop, dark AND light mode [EXPANDED] — covered by behavior tests + class inspection in this worktree (worktree preview serves main's code, per known lesson); live walk deferred to post-merge staging verification, surfaced in PR body
- [x] 5.5 Confirm no `// INTENT:` comments were removed or contradicted (index.tsx, CompactStatsRow, FirstRunZeroState) and no new pages/dialogs/menus were added — 4 INTENT blocks present; header change reuses existing account dropdown

## 6. Ship gate

- [ ] 6.1 Commit in worktree, open PR to main, ensure CI (Quality → Test → Build) green
- [ ] 6.2 Run `/review`; this PR changes user-visible behavior, so also run the Codex second-opinion review before merge; address findings
- [ ] 6.3 Merge from the main repo directory; branch/worktree hygiene per CLAUDE.md
- [ ] 6.4 Update tracking docs (OPEN-TODOS.md if referenced) and note remediation completion in `docs/ux-audits/exhibitor-my-shows-elderly-ux-audit-2026-07-09.md` follow-up or docs index as applicable
