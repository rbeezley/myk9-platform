# Ringside navigation — permanent sidebar entry + smart `/at-show` landing

> **Status:** Complete — archived 2026-07-12 (permanent at-show sidebar item for every role — "Ringside" for staff, "Show day" for exhibitors — in `unifiedSidebarConfig.ts`; bare `/at-show` smart landing in `RingsideEntryPage`: anon→`SmartSignInPage`, signed-in one live show→auto-jump, else→`RingsideHome`; PR #947).

## Why

The `unified_ringside_enabled` flag was removed (PR #947), so `/at-show` ringside
renders for every show. But there was no permanent way to navigate there — only
three role-specific contextual doors (judge dashboard button, exhibitor "Show
today" banner, secretary `nextShow` sidebar item). Owner decision (2026-06-23):
add an **always-visible** "Ringside" sidebar item for every role, and make the
bare `/at-show` route a **smart landing** that resolves the showId so the
permanent button always has a sane destination.

Decisions locked with owner:
- **Always-visible** sidebar item (not show-day-conditional).
- **Auto-jump** when the user has exactly one live show.
- **Keep** the existing contextual CTAs — the sidebar item is additive.

## The core constraint

`/at-show/:showId` needs a showId; bare `/at-show` currently renders
`SmartSignInPage` (a passcode/email classifier). That's right for an anonymous
QR/passcode user but confusing for a signed-in judge arriving with no passcode.
So the work is an **authed branch** on `/at-show` that resolves the user's live
show(s) and routes accordingly — never a dead end (INTENT: no dead ends).

## Landing behavior (`/at-show`)

| Situation | Behavior |
| --- | --- |
| Not signed in | `SmartSignInPage` (unchanged — passcode/QR flow) |
| Signed in, resolving | spinner |
| Signed in, exactly one live (today) show | `<Navigate replace>` to `/at-show/:showId` |
| Signed in, several live shows | Ringside home — tappable show cards |
| Signed in, no live show | Ringside home — "no live show" empty state + upcoming shows + passcode affordance |

"Live" = a today/in-progress show from any source. The home always offers a
"Have a show passcode?" affordance that reuses `SmartSignInPage` (DRY — no
duplicate passcode logic).

## Sources (all role-self-gating)

- **Judge** — `useJudgeAssignments()` → `JudgeClass[]` (showId, name, status,
  trialDate). Live = `status === 'in-progress'` or `trialDate` is today.
- **Exhibitor** — `useShowTodayBanner().items` → today's shows (showId, showName).
- **Manager/secretary** — `useShowStore(s => s.shows)` → `useMyShows().today`.

## Phases

### Phase 1 — pure resolver (TDD)
- [ ] `resolveRingsideEntry({ judgeClasses, exhibitorToday, managerToday, managerUpcoming, todayISO })`
      → `{ liveShows: RingsideShowRef[], upcomingShows: RingsideShowRef[] }`,
      deduped by showId, stable order. Pure, no hooks. Assertion-first tests:
      dedup across sources, today-vs-upcoming split, empty.

### Phase 2 — hook + page
- [ ] `useRingsideEntryShows()` — wires the three source hooks into the resolver;
      returns `{ liveShows, upcomingShows, isLoading }`.
- [ ] `RingsideEntryPage` at `/at-show`: anon → `SmartSignInPage`; loading →
      spinner; 1 live → `<Navigate replace>`; else → `RingsideHome`.
- [ ] `RingsideHome` — show cards (live + upcoming) deep-linking to
      `/at-show/:showId`; empty state when none; "Have a passcode?" affordance
      that renders `SmartSignInPage`.
- [ ] Wire `App.tsx` `/at-show` route → `RingsideEntryPage` (keep `/sign-in` →
      `SmartSignInPage`).

### Phase 3 — sidebar
- [ ] Add a "Ringside" `NavItem` (`href: '/at-show'`, icon `Radio`) to the
      exhibitor-only group AND a dedicated entry for multi-role users; update the
      stale "no static at-show link" comment (lines 108-114).
- [ ] Sidebar config tests: Ringside item present for exhibitor-only, judge,
      secretary, admin.

### Phase 4 — verify
- [ ] `pnpm typecheck` clean, changed files lint clean, at-show + sidebar + new
      tests green. Manual smoke deferred to staging (Preview MCP is main-pinned
      in a worktree).

## Progress — 2026-06-23

All four phases implemented in this PR:
- **Phase 1** — `ringsideEntryResolver.ts` (pure) + 9 assertion-first tests.
- **Phase 2** — `useRingsideEntryShows.ts`, `RingsideEntryPage.tsx`,
  `RingsideHome.tsx`; `/at-show` route swapped to `RingsideEntryPage` in
  `App.tsx`. 7 page tests (anon, both spinners, auto-jump, chooser, empty,
  passcode toggle).
- **Phase 3** — shared `RINGSIDE_NAV_ITEM`; exhibitor-only group + new multi-role
  "Show Day" group; stale comment + two old exhibitor tests updated; +6 sidebar
  tests.
- **Phase 4** — `pnpm typecheck` clean (25/25); changed files lint clean
  (`--max-warnings 0`); at-show + sidebar suites green (29 files / 206 tests);
  SmartSignInPage unaffected (21). Manual staging smoke deferred (Preview MCP is
  main-pinned in a worktree).

## Out of scope
- Consolidating the existing judge/exhibitor CTAs into this path (owner chose
  "keep all" — revisit later).
- A full standalone ringside dashboard; the home is an entry/chooser, not a hub.
