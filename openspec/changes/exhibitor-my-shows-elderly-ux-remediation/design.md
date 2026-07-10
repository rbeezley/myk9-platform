# Design: exhibitor-my-shows-elderly-ux-remediation

## Context

`/exhibitor/entries` (My Shows) is rendered by `apps/myk9show/src/pages/MyEntriesPage/index.tsx` (711 lines), with `CompactStatsRow` (summary metrics), `PrimaryTabs` (six filters), and `MyEntryCard` (entry/class detail, 465 lines). All data comes through `useMyEntriesData` / `useMyEntriesFilters` on existing replication-backed reads — no data-layer change is needed or allowed; this is a presentation-and-copy remediation. The Codex audit findings and their code verification are recorded in `docs/ux-audits/exhibitor-my-shows-elderly-ux-audit-2026-07-09.md` and the proposal.

Key verified facts driving the design:

- "Current Entries" = non-past accepted+pending (`useMyEntriesFilters.ts:104-106`); "My Entries"/"All" badge = `entries.length`. Both correct, scope unexplained on screen.
- `<h1>My Shows</h1>` is `sr-only` (`index.tsx:323`); phone users see only the greeting.
- `MyEntryCard` always expands every class row, confirmation number, and close date; primary actions render after them.
- "Enter a Show" is `size="sm"` (h-8 = 32px); the directions anchor has no min-height (~22px).
- Phone header renders search, bell, cart (conditional), theme toggle, AskQ, account — six unlabeled icon targets.
- Filter-empty state is one generic "Browse All Shows" for all six tabs; error copy says "Please check your connection."

## Goals / Non-Goals

**Goals:**

- The first phone screen answers: what show is next, what is my status, what do I do — without interpreting scopes or scanning class tables.
- No two on-screen counts can be read as the same scope with different values.
- Every inline action ≥44×44px; supporting copy readable for reduced vision in both color modes.
- `index.tsx` back under 500 lines via extraction, not deletion of behavior.

**Non-Goals:**

- No filter-vocabulary redesign, no attention-priority engine, no new surfaces, no data-layer/replication changes (see proposal Non-Goals).

## Decisions

1. **Scope labels over count unification.** Keep both counts (they serve different questions) but rename visibly: summary card label becomes "Current entries" with sublabel "upcoming + in review"; the entries section eyebrow becomes "All entries" with a one-line note "Includes past shows" (exact strings pinned by tests). Alternative — making "All" the only count — rejected: current-entry focus is the useful default and matches `exhibitor-count-integrity`'s existing dashboard scenario.
2. **Progressive disclosure inside `MyEntryCard`, not a new compact card component.** Split the existing component into an always-visible summary band (status, dog + armband, show date, location/directions, single next action) and a `ShowDetails` collapsible (class rows, confirmation number, results detail). Next action derived by a pure helper `deriveEntryNextAction(entry)` with precedence: finish payment → check in (first check-in-eligible class) → view show. Check-in from the summary band reuses the existing check-in control/mutation — no duplicate write path. Collapsed by default on all viewports for consistency; expanded state is per-card local `useState`. Alternative — CSS-only clamp — rejected: hides actions unpredictably.
3. **Close date shown conditionally.** Render "Entries close …" in the summary only while editing is still possible (entry not past close, per existing `entry-period-enforcement` semantics already available on the entry object); otherwise it moves into details.
4. **Touch targets via existing button sizes.** "Enter a Show" moves to default `size` (h-10/44px on touch via existing tokens) — same pattern FirstRunZeroState already uses (`size="lg"`); directions anchor gets `min-h-[44px] flex items-center` like other card buttons; sidebar close control gets the same min-height.
5. **Typography token bump, not per-element overrides.** Muted supporting copy in the summary band and stats row moves from `text-sm`/`text-[11px]` to `text-sm`→`text-base` and `text-[11px]`→`text-xs`+stronger foreground token where it's primary reading text; decorative/reference text stays. Verify contrast in both themes with `preview_inspect`-style checks in review, and keep the `motion-language`/theme token system — no hardcoded colors.
6. **Metric-card affordance = trailing chevron.** Add a `ChevronRight` (with `aria-hidden`) to each `CompactStatsRow` card; the existing `aria-label` "…View details" already covers AT. Alternative — "View" text label — rejected: crowds the 11px card layout.
7. **Fees tile paid-in-full de-emphasis in `CompactStatsRow`.** When amount due (from the existing shared derivation — do not recompute) is $0: tile renders muted "Paid in full" + link styling to My Payments, no large `$`figure. Positive due keeps the prominent amount + existing cart/recovery href. This extends`exhibitor-money-clarity` without touching its derivation.
8. **Phone header consolidation into the account dropdown.** In `AppHeader.tsx`, below `md`: theme toggle and AskQ assistant become items in the existing account dropdown menu (labels + icons); their standalone icon buttons hide at phone widths only. Desktop unchanged. Alternative — a new overflow "…" menu — rejected per consolidation rule (no new menus).
9. **Filter strip: readable labels + stronger edge cue.** Keep `PrimaryTabs` structure; ensure labels never truncate below legibility on 390px (allow the strip to scroll rather than shrink: replace `flex-1` with min-width triggers on phone) and strengthen the existing right-edge fade with a subtle chevron indicator shared by the dog strip.
10. **Per-tab empty states from a lookup table.** `EMPTY_STATE_BY_TAB` map (pure, testable) supplying heading, body, and CTA per tab (Waitlist explains waitlisting; Completed points to Upcoming; Pending reassures "the show secretary is reviewing"; default remains Browse All Shows). Also reuse the "secretary is reviewing" reassurance line on the Pending status badge tooltip/subtext.
11. **Error copy.** Replace "Failed to load your entries. Please check your connection." with offline-normal phrasing: "We couldn't refresh your entries just now. Your saved information is still here — try again in a moment." Retry button unchanged.
12. **File-size extraction.** Move `EmptyState`/error section, tab definitions, and the entries-section scaffolding out of `index.tsx` into sibling modules (`modules/` already exists) to get under 500 lines.

## Risks / Trade-offs

- [Collapsed class details hide results/check-in from muscle-memory users] → next-action surfacing keeps check-in reachable in one tap; details toggle is a full-width, labeled control; validate via existing e2e/manual walk.
- [Header consolidation makes theme/AskQ two taps on phone] → acceptable per audit (choice overload outweighs); desktop unchanged; INTENT check: neither is a show-day-critical action.
- [String changes break source-text regression tests elsewhere] → grep for pinned phrases ("Please check your connection", "Browse All Shows", stat labels) before editing; update tests in the same commit.
- [`MyEntryCard` refactor regressions (payment chip, check-in wiring)] → assertion-first unit tests on `deriveEntryNextAction` and card summary rendering before refactor; existing card tests kept green.
- [Contrast/type bump ripples into other pages via shared tokens] → scope changes to component-level classes, not global tokens.

## Open Questions

None blocking; exact copy strings may be tuned during implementation but must keep the pinned scope-label semantics.
