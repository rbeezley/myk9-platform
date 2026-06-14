# Show Overview Tab Redesign

**Date:** 2026-03-15
**Status:** Draft
**Scope:** Replace the legacy Overview tab content on ShowDetailsPage with a unified, MEC-inspired layout for all roles.

---

## Problem

The ShowDetailsPage's Overview tab renders two completely different legacy components depending on role:

- **Secretary/admin:** `ShowDetailsEnhanced` (887 lines) — an entire pre-Phase-1 page with its own breadcrumbs, header, 7 nested tabs, dropdown menus, and CSS-class-based styling (`myk9-*`). This creates tabs-within-tabs and duplicates the outer PageHeader's management actions.
- **Exhibitor:** `PublicShowView` (189 lines) — cleaner but uses its own layout wrapper, its own hero (`ShowBrandedHero`), and none of the Phase 1 shared primitives.

The result is that the Overview tab — the most important tab for exhibitors deciding whether to enter a show — looks inconsistent, feels like a different app from the rest of the page, and buries key information behind nested navigation.

## Goals

1. Replace both legacy components with a single `ShowOverviewTab` that renders the same content for all roles.
2. Present all the information an exhibitor needs to decide whether to enter a show — dates, fees, location, schedule, officials, judges — in a polished, scannable layout.
3. Add personal touches that differentiate from competitors: organizer/judge avatars, interactive venue map with directions, club's other upcoming shows.
4. Move all management actions to the outer PageHeader (already partially done in Phase 1), eliminating the nested header/tabs/dropdown from ShowDetailsEnhanced.

## Non-Goals

- Redesigning the DetailHero component (Phase 1 handles the show name/metadata above the tabs)
- Building entirely new backend/database infrastructure — we need minor hook extensions (see Data Source Notes) but no new tables or API endpoints
- Secretary-specific overview content (stats cards, trial management) — secretary management lives in the dedicated `/secretary/shows/:id` management pages, not the Overview tab

## Design Inspiration

Modern Events Calendar (MEC) by Webnus — specifically the "Fluent" template layout. Key patterns adapted:

- Quick info bar with icon + label + value (DATE | TIME | COST | REGISTER)
- Two-column layout: main content left, people sidebar right
- Organizer card with avatar, name, contact info
- Speakers list with avatar + name + role
- Interactive map with "Get Directions" button and venue name/address
- Countdown to event deadline
- Related Events card grid at the bottom

Adapted to fit myK9 design language: Tailwind CSS, shadcn/ui components, INTENT.md accessibility standards (48px touch targets, 16px min font, WCAG AA contrast), no decorative animations.

---

## Layout Structure

Two-column layout within the Overview tab content area. Collapses to single column on mobile (sidebar content stacks below main content).

```
┌─────────────────────────────────────────────────────┐
│ QuickInfoCards (full width, above columns)           │
│ ┌──────────┬──────────┬──────────┬──────────┐       │
│ │ Date     │ Fee      │ Location │ Club     │       │
│ └──────────┴──────────┴──────────┴──────────┘       │
├──────────────────────────────┬──────────────────────┤
│ Main Content (left ~65%)     │ Sidebar (right ~35%) │
│                              │                      │
│ EntryCTA                     │ ShowOfficials        │
│ (status + Register button)   │  Chairman (avatar)   │
│                              │  Secretary (avatar)  │
│ ScheduleSummary              │                      │
│  Day 1: classes...           │ Judges               │
│  Day 2: classes...           │  Judge 1 (avatar)    │
│                              │  Judge 2 (avatar)    │
│ VenueMap                     │  Judge 3 (avatar)    │
│  [Google Maps iframe]        │                      │
│  Address + Get Directions    │ ShareEvent           │
│                              │  Facebook, Email,    │
│ AdditionalDetails            │  Copy Link           │
│  Organization, rules, etc.   │                      │
├──────────────────────────────┴──────────────────────┤
│ MoreFromClub (full width, below columns)            │
│ ┌──────────┬──────────┬──────────┐                  │
│ │ Show 1   │ Show 2   │ Show 3   │                  │
│ └──────────┴──────────┴──────────┘                  │
└─────────────────────────────────────────────────────┘
```

### Mobile Layout

On screens < 768px (md breakpoint), the two-column layout collapses:

```
QuickInfoCards (2x2 grid instead of 4-across)
EntryCTA
ShowOfficials (moves here from sidebar)
Judges
ScheduleSummary
VenueMap
AdditionalDetails
ShareEvent
MoreFromClub (2-across or stacked)
```

Officials and judges move above the schedule on mobile because the personal touch is high-impact and should appear early in the scroll.

---

## Section Details

### QuickInfoCards

A horizontal row of 4 cards (2x2 on mobile). Each card has a muted icon, a small label, and a prominent value. Styled as a single card with dividers between items (like MEC's info bar), not 4 separate cards.

| Card     | Icon         | Label     | Value                                    | Notes                                                                  |
| -------- | ------------ | --------- | ---------------------------------------- | ---------------------------------------------------------------------- |
| Date     | CalendarDays | Date      | "Sat, Mar 21, 2026" or "Mar 21–22, 2026" | Multi-day shows use range format                                       |
| Fee      | DollarSign   | Entry Fee | "$30 pre-entry"                          | Shows pre-entry fee; day-of-show fee in AdditionalDetails if different |
| Location | MapPin       | Location  | "Olathe, KS"                             | Uses `city` + `state` DB fields (full address in VenueMap section)     |
| Club     | Users        | Host Club | "Jayhawk Agility Club"                   | Club name                                                              |

If `entryCloseDate` exists and entries are open, the Date card shows a subtle secondary line: "Entries close Mar 15."

### EntryCTA

A horizontal bar with registration status and action button. Three visual states:

**Entries open (normal):**

- Left: "Entries close in 12 days" in muted text
- Right: "Register Now" primary button (48px height)

**Entries closing soon (≤3 days):**

- Amber-tinted background
- Left: "Entries close tomorrow!" or "6 hours left!" in amber text
- Right: "Register Now" primary button

**Entries closed / not open / draft:**

- Muted background
- Left: Status explanation ("Entries closed" / "Entries open Mar 1" / "Show not yet published")
- Right: Disabled button with matching label

The countdown logic already exists in `ShowDetailsEnhanced`'s `registrationState` memo — it moves here.

### ScheduleSummary

Reuses the existing `useScheduleSummary` hook and the day-by-day rendering pattern from `PublicShowView`. Wrapped in a card with a "Schedule" heading.

Each day shows:

- Day name + date ("Saturday, March 21")
- Disciplines with elements and level ranges

If no schedule data exists, this section is omitted entirely (not an empty state).

### ShowOfficials

A sidebar card with two tiers:

**Key Officials** (larger treatment):

- Chairman: Avatar (64px, photo or initials fallback) + name + "Chairman" label + optional phone/email
- Secretary: Avatar (64px) + name + "Secretary" label + optional phone/email

Each official is displayed vertically (avatar above name), similar to MEC's organizer card layout.

**Avatar fallback:** When no photo exists, render initials in a colored circle. The color is deterministic — derived from a hash of the person's name, selecting from a palette of 8 muted colors (slate, stone, zinc, neutral, amber, emerald, sky, violet). Same person always gets the same color.

**Data source:** Show records have `chairman` and `secretary` fields (person IDs or names). The existing `useResolvePersonName` hook only returns a name string — it needs to be extended (or a new `useResolvePerson` hook created) to return the full person object including `profile_image` (the DB column name on the `people` table) and optionally `email`/`phone`. See "Data Source Notes" section below for details.

### Judges

A separate sidebar card below ShowOfficials. Displays assigned judges in a compact list:

- Each judge: Avatar (48px, photo or initials fallback) + name + optionally number of assigned classes
- Layout: each judge is a horizontal row (avatar left, name + subtitle right), stacked vertically

If no judges are assigned, show a simple "Judges not yet announced" message (not a full empty state).

**Data source:** `show.assignedJudges` array, each with `judgeName` and optionally `assignedClasses` (array of class IDs). Display the count of assigned classes rather than resolving IDs to names (e.g., "4 classes assigned").

### VenueMap

A main-column card with:

1. **Google Maps iframe embed** — composes a full address from the show's DB fields (`address`, `city`, `state`, `zip_code`) and uses it as the query parameter. Default to the keyless embed: `https://maps.google.com/maps?q=ENCODED_ADDRESS&output=embed`. If `VITE_GOOGLE_MAPS_API_KEY` is set, use the Embed API: `https://www.google.com/maps/embed/v1/place?key=API_KEY&q=ENCODED_ADDRESS`. The map is ~300px tall with rounded corners.

2. **Venue name + full address** — `venue_name` displayed as a bold heading, full composed address below it, with a map pin icon.

3. **"Get Directions" button** — opens Google Maps directions in a new tab: `https://www.google.com/maps/dir/?api=1&destination=ENCODED_ADDRESS`. Secondary button style, 48px touch target.

**Address composition:** Combine available fields: `[address, city, state, zip_code].filter(Boolean).join(', ')`. If the result is empty (no address fields populated), omit this entire section. The `location` field on the Show TypeScript type currently holds a single string — if it contains a usable address/city value, use it as fallback when the separate fields aren't available.

If no usable address can be composed, this entire section is omitted.

### AdditionalDetails

A key-value grid (2 columns desktop, 1 column mobile) for remaining show metadata. Only renders items that have values — the entire section is omitted if nothing qualifies.

Possible items:

- Organization (AKC, UKC, ASCA, etc.)
- Chief Steward
- Day-of-Show Fee (only if different from pre-entry fee)
- Max Entries per Dog
- Max Total Entries
- Non-Owner Handlers (Allowed / Not Allowed)

### ShareEvent

A small sidebar card with share options:

- Facebook share button
- Email share button
- Copy link button

Uses the existing `ShareButton` component's logic but displayed as individual icon buttons in a row, similar to MEC's "Share this event" section. The `shareData` construction from `PublicShowView` moves here.

### MoreFromClub

A full-width section below the two-column layout. Shows up to 3 upcoming shows from the same club (excluding the current show). Each show is a card with: show name, dates, location, entry status badge. Tapping navigates to that show's detail page.

If the club has no other upcoming shows, this section is omitted.

**Data source:** Filter the existing shows query by `clubName` or `clubId`, exclude current show, sort by `startDate`, take first 3.

---

## Component Architecture

### New Files

| File                                                  | Purpose                                                        |
| ----------------------------------------------------- | -------------------------------------------------------------- |
| `src/components/shows/tabs/ShowOverviewTab.tsx`       | Main Overview tab component — orchestrates layout and sections |
| `src/components/shows/overview/QuickInfoCards.tsx`    | Date/Fee/Location/Club info bar                                |
| `src/components/shows/overview/EntryCTA.tsx`          | Registration status + action button                            |
| `src/components/shows/overview/ShowOfficials.tsx`     | Chairman + Secretary avatars card                              |
| `src/components/shows/overview/JudgesList.tsx`        | Judges avatar list card                                        |
| `src/components/shows/overview/VenueMap.tsx`          | Google Maps embed + address + directions                       |
| `src/components/shows/overview/AdditionalDetails.tsx` | Key-value metadata grid                                        |
| `src/components/shows/overview/MoreFromClub.tsx`      | Related shows from same club                                   |
| `src/components/shows/overview/ShareEvent.tsx`        | Share buttons (Facebook, email, copy link)                     |
| `src/components/common/PersonAvatar.tsx`              | Reusable avatar with photo or deterministic initials fallback  |

### Modified Files

| File                            | Change                                                                                          |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/pages/ShowDetailsPage.tsx` | Replace `ShowDetailsMain`/`PublicShowView` bifurcation in Overview tab with `<ShowOverviewTab>` |

### Files to Delete

| File                                                       | Reason                                                                                                                                    |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/shows/ShowDetailsMain.tsx`                 | Thin wrapper, replaced by direct tab content                                                                                              |
| `src/components/shows/ShowDetails/ShowDetailsEnhanced.tsx` | 887-line legacy component, fully replaced. If this is a directory (`ShowDetailsEnhanced/`) with sub-modules, delete the entire directory. |

### Files to Evaluate for Deletion

| File                                              | Evaluation Needed                                                                       |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/components/shows/PublicShowView.tsx`         | Check if referenced elsewhere; if only used in ShowDetailsPage Overview tab, delete     |
| `src/components/shows/ShowBrandedHero.tsx`        | Check if referenced elsewhere; if only used in PublicShowView, delete                   |
| `src/components/shows/ShowDetails/EntriesTab.tsx` | Check if duplicated by outer tabs; may still be needed                                  |
| `src/components/shows/ShowCloneDialog` usage      | Currently rendered by ShowDetailsMain; migrate to PageHeader actions if cloning is kept |

### Files NOT to Delete (Future Cleanup)

| File                               | Why Not Now                                                                                                                                                                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/styles/myk9-show-details.css` | Imported by 24+ files across the app (BrowseShowsPage, BrowseDogsPage, BrowseClubsPage, scoring components, etc.). Can only be deleted after all consumers migrate to Tailwind — a multi-sprint effort outside this task's scope. Remove the import from `ShowDetailsPage.tsx` only. |

### Preserved / Reused

| Existing Code                                                         | Reused In                                     |
| --------------------------------------------------------------------- | --------------------------------------------- |
| `useScheduleSummary` hook                                             | ScheduleSummary section                       |
| `useResolvePersonName` hook (extended — see Data Source Notes)        | ShowOfficials, JudgesList                     |
| Registration state logic (countdown/urgency from ShowDetailsEnhanced) | EntryCTA component                            |
| `shareOrCopy` utility from ShareButton                                | ShareEvent copy-link button                   |
| `useClassAvailability` hook                                           | Not needed in Overview (lives in Classes tab) |

---

## Data Source Notes

Several existing hooks and types need minor extensions for this feature:

### 1. Person Resolution (for avatars + contact info)

The existing `useResolvePersonName` hook returns only a name string. ShowOfficials and JudgesList need the full person object (name, `profile_image`, optionally email/phone).

**Approach:** Create a new `useResolvePerson` hook (or extend the existing one) that queries the `people` table and returns `{ name, profileImage, email?, phone? }`. The `people` table column for photos is `profile_image` (not `avatar_url`). The TypeScript `User` type uses `profileImage`.

### 2. Address Fields

The Show TypeScript type (`src/types/show-types.ts`) currently has a single `location: string` field. The database `shows` table has separate columns: `venue_name`, `address`, `city`, `state`, `zip_code`. If the TypeScript type doesn't expose these separate fields, either:

- Extend the Show type to include them, or
- Use the single `location` field as a best-effort address for the map query

During implementation, check which fields are actually populated in the database and choose the pragmatic path.

### 3. MoreFromClub Query

No existing hook fetches shows filtered by club. This is a simple React Query hook: filter the shows list by `clubId` or `clubName`, exclude the current show, sort by `startDate`, take 3. Can be a one-off query in the `MoreFromClub` component or a small `useClubShows(clubId, excludeShowId)` hook.

### 4. ShareEvent (replacing ShareButton)

The existing `ShareButton` uses the Web Share API via `shareOrCopy()`. The new `ShareEvent` component renders individual platform buttons (Facebook, Email, Copy Link) instead of a single share button. The `shareOrCopy` utility is reusable for the copy-link button. Facebook sharing uses a URL (`https://www.facebook.com/sharer/sharer.php?u=ENCODED_URL`). Email uses a `mailto:` link with subject and body.

---

## PersonAvatar Component

A shared component for rendering person avatars with deterministic fallback, extracted to `components/common/` for reuse on Dog detail pages (owner avatar), Club detail pages (member avatars), and People pages.

```typescript
interface PersonAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg'; // 32px, 48px, 64px
  className?: string;
}
```

**Size mapping:** `sm` = 32px (h-8 w-8), `md` = 48px (h-12 w-12), `lg` = 64px (h-16 w-16)

**Initials extraction:** First letter of first name + first letter of last name, uppercase. If only one name, use first two letters. If empty string, use "?".

**Color palette** (8 deterministic colors based on name hash):

- slate-500, stone-500, zinc-500, amber-600, emerald-600, sky-600, violet-600, rose-600

The background is the selected color at 15% opacity, text is the color at full strength. This keeps it readable in both light and dark modes.

---

## ShowDetailsPage Tab Cleanup

With the Overview tab properly built, the outer tabs on ShowDetailsPage should be reviewed. Currently Phase 1 defined: Overview, Classes, My Entries, Results.

ShowDetailsEnhanced had additional tabs that provided value: **Trials** and **Activity**. These should be evaluated:

- **Trials tab:** Shows trial cards with dates, status, trial numbers. Useful for multi-trial shows. If the show has >1 trial, this tab has value. However, trial info could also be folded into the Schedule section of the Overview. **Decision: omit as a separate tab for now.** The schedule summary covers the day-by-day view. If users need per-trial detail, it can be added later.

- **Activity tab:** Shows an `ActivityTimeline` of changes. This is a secretary/admin concern, not an exhibitor one. **Decision: omit for now.** Activity belongs in the secretary management pages.

- **Registration tab (from ShowDetailsEnhanced):** Entry dates, fees, countdown. **Fully replaced by EntryCTA + QuickInfoCards in the Overview tab.**

- **Management tab (from ShowDetailsEnhanced):** Secretary quick actions. **Replaced by PageHeader actions + dedicated management pages.**

- **Assignments tab (from ShowDetailsEnhanced):** Judge assignments. **Belongs in the Judge dashboard, not the show detail page.**

Final tab set remains: **Overview, Classes, My Entries, Results** (unchanged from Phase 1).

---

## Accessibility

All sections follow INTENT.md and Phase 1 spec accessibility requirements:

| Requirement       | Implementation                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| Touch targets     | All buttons ≥ 48px height, including Register, Get Directions, share buttons                          |
| Font sizes        | 16px body minimum, labels can be 14px (absolute minimum), values ≥ 16px                               |
| Contrast          | WCAG AA on all text. Avatar initials use full-strength color on 15% background for high contrast      |
| Map accessibility | Map iframe has descriptive `title` attribute. Address and directions available as text (not map-only) |
| Mobile            | Two-column collapses to single column. QuickInfoCards go 2x2. Touch targets maintained                |
| No hover-only     | All interactions work on touch. Share buttons are tap targets, not hover menus                        |

---

## Testing

### Unit Tests (Vitest + React Testing Library)

**ShowOverviewTab:**

- Renders QuickInfoCards with show data
- Renders EntryCTA with correct registration state
- Renders ShowOfficials when chairman/secretary exist
- Renders JudgesList when judges assigned
- Renders VenueMap when location exists
- Omits VenueMap when no location
- Omits ScheduleSummary when no schedule data
- Omits AdditionalDetails when no additional metadata
- Omits MoreFromClub when no other club shows
- Two-column layout renders on desktop viewport

**QuickInfoCards:**

- Renders all 4 info items with correct icons and values
- Formats single-day vs multi-day date ranges correctly
- Shows entry close date as secondary text when available

**EntryCTA:**

- Renders "Register Now" button when entries are open
- Shows amber urgency styling when ≤3 days remain
- Shows disabled state with correct label when entries closed
- Shows "not open yet" state before entry open date
- Register button has ≥48px touch target

**PersonAvatar:**

- Renders image when avatarUrl provided
- Renders initials when no avatarUrl
- Extracts correct initials from full name
- Handles single-name, empty-name edge cases
- Same name always produces same fallback color
- Renders at correct size for sm/md/lg

**ShowOfficials:**

- Renders chairman and secretary with avatars
- Handles missing chairman or secretary gracefully
- Shows contact info when available

**JudgesList:**

- Renders list of judges with avatars
- Shows "Judges not yet announced" when empty
- Displays assigned disciplines when available

**VenueMap:**

- Renders Google Maps iframe with encoded address
- Shows venue name and address text
- "Get Directions" link has correct href
- Iframe has accessible title attribute

**MoreFromClub:**

- Renders up to 3 upcoming shows from same club
- Excludes current show from list
- Omits section when no other shows exist
- Cards navigate to show detail page on click

### Integration Test

**ShowDetailsPage Overview tab:**

- Loading state renders skeleton
- Overview tab is default when user has no entries
- All sections render with complete show data
- Secretary sees same Overview content as exhibitor (no bifurcation)

---

## Success Criteria

1. The Overview tab renders identical content for all roles (exhibitor, secretary, judge, admin).
2. An exhibitor can see date, fee, location, club, schedule, officials, judges, and venue map without leaving the Overview tab.
3. All management actions live in the outer PageHeader, not inside the Overview content.
4. `ShowDetailsEnhanced` (887 lines) and `PublicShowView` (189 lines) are deleted.
5. `myk9-show-details.css` is deleted — no legacy CSS classes remain.
6. PersonAvatar renders deterministic initials fallback with consistent colors.
7. All interactive elements meet 48px touch target minimum.
8. The page passes WCAG AA contrast requirements.
