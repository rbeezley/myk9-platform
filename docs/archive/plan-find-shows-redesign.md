# MYK9-427 — Find Shows redesign (direction D)

> **Status:** Complete — PR 1 #2087 (fe7395706), PR 2 #2090 (9579c09cf), both verified on staging 2026-09-06.

Design canvas: <https://claude.ai/code/artifact/21c5d363-1a22-41e5-a1fa-d78836f93b7c>
(artboard "D · Refined + month scrubber"). Linear: MYK9-427.

The public Find Shows page (`/shows`) defaults anonymous and multi-role visitors
to a six-column table that needs a horizontal scrollbar, and its date filter is
a three-option chip (Upcoming / This month / Next month). Direction D keeps the
page's structure and four views, makes cards the default, fixes the table, and
replaces the date chip and the Past Shows tab with a month scrubber. A second PR
adds a location-aware search bar.

Decisions taken with Richard on 2026-09-06: two PRs; the scrubber absorbs the
Past Shows tab; a known location sorts and labels but never hides shows until a
radius is chosen.

## PR 1 — cards default, table fix, month scrubber

No new dependencies.

### Default view

`getDefaultViewMode` in `pages/BrowseShowsPage.tsx` returns `'cards'` for every
tab except `managing`, which keeps `'table'` (the secretary's working list).
Today only exhibitor-only accounts get cards; guests and multi-role users land on
the table.

### Table

`components/shows/browse/ShowsTableView.tsx` renders five columns: Show (name;
organization and disciplines in the subline), Dates, Location (venue line, then
city/state, wrapping), Entries (the existing `EntryStatusBadge`), Host Club.
Organization and Status start hidden (DataTable `defaultColumnVisibility`)
and stay in the Columns menu; `exportHidden` column meta keeps both in every
CSV export so secretaries lose nothing.
A `splitShowLocation` helper in `ShowsTableView.helpers.ts` breaks the single
`location` string at its first comma.

### Month scrubber

New `components/shows/browse/MonthScrubber.tsx` plus a pure
`monthScrubber.helpers.ts`:

- `buildMonthTiles(shows, now)` returns an `all` tile and one tile per month from
  three months back through twelve months ahead. Each tile carries `count`,
  `dots` (one entry-status kind per show, in the order shown) and `isPast`.
- The selected month lives in the URL as `?month=YYYY-MM` through the existing
  `useUrlFilters` in `useBrowseShowsFilters.ts`, replacing `dateRange`. The
  allow-list for `month` is a shape check (`^\d{4}-\d{2}$`) rather than a fixed
  vocabulary; `useUrlFilters` only supports a list, so `month` is validated in
  the hook before use. A stale `?dateRange=` param is ignored.
- `applyFilters`: with no month, keep today's "upcoming" rule; with a month,
  keep shows whose start date falls in that month, past or future. The skip for
  `managing` / `assignments` stays for the upcoming rule only; a chosen month
  filters those tabs too.
- The scrubber renders between `ListControls` and the tab row, scrolls
  horizontally with the existing `hide-scrollbar scroll-shadow-x` classes, and
  auto-scrolls the All tile into view on mount.

### Past Shows tab

Removed from `getTabsForUser` and `getAccessibleTabs`; `filterShowsForTab`
loses its `past` arm. `ShowPermissionValidator.canAccessTab` no longer knows
`past`, so a stale `?tab=past` link falls back to the default tab via
`useUrlTab`. The tab row hides when Browse All is the only tab (`PrimaryTabs`
gets a `hideWhenSingle` prop, default off, so no other page changes).

### Motion

Cards already use `StaggeredGrid`. The closing-soon ring on the date box is
already in `ShowCardHorizontal`. Nothing new.

### File-size ceiling

`BrowseShowsPage.tsx` is ~500 lines. The chip definitions and the view-mode
default move to `browseShowsPage.helpers.ts` so the scrubber wiring fits under
the ceiling. Run `pnpm qa:code-quality-ratchet` from the worktree before push.

### Testing (PR 1 is not complete until these pass)

- [x] `monthScrubber.helpers.test.ts`: tile range, counts, dot order, past
      flag, a show on the 1st and the 31st, empty list.
- [x] `useBrowseShowsFilters.test.ts`: `?month=` keeps shows in that month
      including past ones; malformed month falls back; the `dateRange` tests
      are replaced.
- [x] `ShowsTableView.test.tsx`: five visible headers, no Organization or
      Status header, location split into two lines, export columns still six.
- [x] `BrowseShowsPage.test.tsx`: guests and multi-role users default to cards;
      `managing` defaults to table; no Past Shows tab for any role; tab row
      hidden for guests; `?tab=past` falls back.
- [x] `showsUI.spec.ts` and `cross-browser-compatibility.spec.ts` updated to the
      scrubber (the Club Details Past Shows tab is a different surface and
      stays). E2E runs in CI only; not executed locally.
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm qa:code-quality-ratchet`, one
      whole-suite `pnpm vitest run --sequence.shuffle` (no module-scope state
      added).
- [x] Browser check at 1440 and 1024 on the dev server: table has no
      horizontal scrollbar (scrollWidth == clientWidth at 1024); guest lands on
      cards with no tab strip; a month tile filters and writes `?month=`;
      arrow keys move the selection.

## PR 2 — location-aware search bar

### Location resolution

`features/location/resolveViewerLocation.ts` returns
`{ label, lat, lng, source: 'profile' | 'remembered' | 'ip' | 'none' }`, first
match wins:

1. A location the visitor typed, picked, or an explicit Anywhere, remembered
   in `localStorage` (`myk9.findShows.location`). Anywhere is remembered too,
   so the profile does not reassert itself after the visitor clears it.
2. Signed in: `people.city` / `state` / `zip_code`, geocoded once through
   `/api/geo?q=` and cached in React Query for a day.
3. Signed out: `GET /api/geo` (new `apps/myk9show/api/geo.ts`, a Vercel
   function reading `x-vercel-ip-city`, `x-vercel-ip-country-region`,
   `x-vercel-ip-latitude`, `x-vercel-ip-longitude`). Labelled "approximate",
   served `private, no-store`. 204 locally where the headers are absent.
4. Nothing known: `Anywhere`, date sort only.

"Use my location" inside the Near popover calls `navigator.geolocation` on
click only. Typed places are geocoded server-side by the same function
(`/api/geo?q=`, Nominatim with a proper User-Agent, edge-cached a day), so the
browser only ever talks to `'self'` and the CSP is untouched. The Vite dev
server does not run `api/`, so locally the field reads Anywhere and typed
places report a miss; the Vercel preview deployment is where this is checked.

### Search bar

`components/shows/browse/ShowSearchBar.tsx` replaces the `SearchBar` slot in
`ListControls` on this page only: the search box plus a Near popover (typed
place, Use my location, Anywhere). No Search button: the list already filters
live, so a button would be a fake step. `ListControls` gains an optional
`searchSlot` prop so other browse pages are untouched.

### Distance

`distanceMiles(a, b)` (haversine) in `features/location/distance.ts`. When a
location is known, `applyFilters` sorts nearest-first within a chosen month
(All upcoming keeps date order) and `ShowCardHorizontal` shows "N mi" after the
venue. Shows without coordinates sort last with no label and are never hidden.
A Distance chip (50 / 100 / 250 / 500 mi, `?radius=`) appears only with a
location and is the only thing that hides shows.

### Testing

- [x] `viewerLocation.test.ts`: precedence, each source alone, none, storage
      round-trip and garbage.
- [x] `distance.test.ts`: known pairs, same point, antimeridian.
- [x] `api/geo.test.ts` (node environment): headers present, absent, typed
      geocode hit/miss/error, method guard. `api/*.test.ts` added to the vitest
      include.
- [x] `useBrowseShowsFilters.test.ts`: radius inert without a location; All
      upcoming keeps date order; a month sorts nearest-first with unpinned
      last; a radius hides only measurable shows beyond it.
- [x] `ShowSearchBar.test.tsx` and page test: Anywhere / label / approximate
      states, typed miss message, device location only from its button, no
      geolocation call on load, Distance chip absent without a location.
- [x] Browser check signed out on staging after merge (the Vercel preview is
      login-walled): Near reads "Broken Arrow, OK · approximate", cards show
      miles, the Distance chip appears; `/api/geo` and `/api/geo?q=` answer;
      no geolocation prompt on load.
