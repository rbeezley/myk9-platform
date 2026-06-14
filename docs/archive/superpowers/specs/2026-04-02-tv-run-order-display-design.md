# TV Run Order Display — Design Spec

**Date:** 2026-04-02
**Status:** Draft
**Context:** Port TV run order display from myK9Q to myK9Show (see [architecture decision](../specs/2026-04-02-one-app-vs-two-apps-design.md))

---

## Summary

A public, unauthenticated live display showing active class run orders and results podiums for a show. Designed for venue TVs (primary) with a responsive mobile layout for exhibitors and spectators browsing on phones/tablets.

## Route & Access

- **URL:** `/tv/:showId` — shows all active classes across the show
- **Optional filter:** `/tv/:showId?trial=abc123` — narrows to a single trial (useful for per-ring TVs)
- **Authentication:** None. Public route using the Supabase anon key for read-only queries.
- **Entry point:** Secretary shares the URL or posts a QR code at the venue.
- **Route file:** `publicRoutes.tsx`, lazy-loaded with `SuspenseWrapper` + `PageTransition`.
- **Fullscreen button:** The TV header includes a fullscreen toggle that calls the browser Fullscreen API — saves fumbling with F11 or TV remote controls. Hidden on mobile (mobile browsers handle fullscreen differently).
- **QR code on secretary dashboard:** The secretary's show management page includes a "TV Display" section with a QR code linking to `/tv/:showId`. Scan with any device to get the display running quickly. Also shows the URL as copyable text.

## Theme

Dark theme for both TV and mobile. Dark backgrounds with light text ensure readability on venue TVs in varied lighting conditions and reduce glare in indoor arenas.

## TV Layout (Large Screens)

### Show Header

A persistent bar across the top showing the show name, a "Live" indicator, and the count of active classes (e.g., "Live • 4 classes in progress").

### Normal State: Persistent Grid

All active classes are visible simultaneously in a responsive grid (2×2 for 4 classes, 3×2 for 6, etc.). No auto-rotation — exhibitors can glance at the TV and find their class without waiting.

Each class card shows:

- **Header:** Class name, level, judge name, progress count ("12 of 28 scored"), status badge (IN PROGRESS, BRIEFING, UPCOMING)
- **In-ring dog:** Armband #, dog name, handler name — highlighted with a blue background
- **Next up (up to 5):** Dogs approaching the ring, with "NEXT" label on the first. Shows up to 5 on TV (space permitting), 3 on mobile.
- **No scored dogs, no full queue, no check-in status** — the display answers "how close am I to running?" and nothing more

As classes complete, they leave the grid. The remaining cards reflow to fill the space.

### Update Behavior

When a score is posted and the run order advances:

- The class card border pulses briefly (~1 second, accent color) to draw attention
- The in-ring dog shifts to the newly active dog
- The next-up list advances
- The progress count increments

### Status Badges

| Status        | Badge Text   | Color |
| ------------- | ------------ | ----- |
| `in_progress` | IN PROGRESS  | Green |
| `briefing`    | BRIEFING     | Amber |
| `setup`       | UPCOMING     | Gray  |
| `start_time`  | STARTS HH:MM | Gray  |

## Podium Takeover (Class Completion)

When all entries in a class are scored and `is_scoring_finalized` becomes `true`, a full-screen podium takeover replaces the grid for 20 seconds, then returns to the grid (with the completed class removed).

### Reveal Sequence

Placements appear via **staggered reveal** — 4th slides up first, then 3rd, 2nd, and finally 1st, with ~1 second between each. Total reveal takes ~5-6 seconds. The remaining 14-15 seconds hold the final state.

### Per-Placement Display

Each placement card shows:

- Medal emoji (🥇, 🥈, 🥉, 4th has no emoji)
- Placement label ("1st Place", "2nd Place", etc.)
- Dog photo (circular crop, medal-color border) — if uploaded by exhibitor
- Breed silhouette fallback — if no photo but breed is set
- Generic paw-print placeholder — last resort
- Armband # and dog name
- Handler name
- Score or search time

### Premium Effects

- **Gold shimmer:** 1st place podium has a continuous animated gradient shimmer (moving light across the gold surface). CSS-only, GPU-accelerated.
- **Confetti burst:** When 1st place appears, a brief CSS confetti/particle animation fires from behind the gold podium. Gold and white particles, fades after ~2 seconds.
- **Class summary stats:** Below the podium: "{entries} entries • {qualified} qualified • Fastest time: {time}". Provides context for the placements.
- **Optional sound effect:** A short synthesized chime when the podium appears. Off by default. Enabled via a settings toggle accessible from the TV header menu. Uses Web Audio API (no audio files).

### Queuing

If multiple classes finish close together, podium animations queue and play back-to-back (20 seconds each). This is rare — classes almost never finish at the exact same moment.

## Mobile Layout (Phones & Tablets)

A scrollable vertical list of class cards. No auto-rotation, no podium takeover. The user is actively browsing, not passively watching.

### Active Classes

Same data as TV cards but in a single-column stack:

- Class header with status badge
- In-ring dog (highlighted)
- Next 3 up
- Progress count

### Completed Classes

Completed classes appear below active classes with inline results — a compact grid of 4 placement cards showing medal emoji, dog name, handler, and time. No staggered reveal or confetti — the mobile view is informational, not theatrical.

## Breed Silhouettes (Shared Asset)

A set of SVG breed silhouettes used as fallback when a dog has no uploaded photo. Stored as a shared asset (not TV-specific) since they are also used on the dog details page.

- Start with the most common breeds in the database
- Expand incrementally
- Uniform visual style: solid fill, consistent dimensions, designed for circular crop
- Mapped from the breed field on the dog record

## Data & Real-Time Architecture

### Data Sources

- **Active classes:** `classes` table joined with `trials` (to filter by show ID), filtered by active statuses (`in_progress`, `briefing`, `setup`, `start_time`, plus platform equivalents `In Progress`, `Scheduled`). Optional trial filter via query parameter. Note: the myK9Q views (`view_combined_classes`, etc.) exist in the myK9Q migration set but may not be present in the platform database, so we query tables directly.
- **Entries / run order:** `entries` table joined with `dogs` for dog info. Filtered by class IDs of active classes, ordered by `run_order`.
- **Completed results:** `classes` table where `is_scoring_finalized = true`, joined with `entries` for top 4 placements (`final_placement` between 1 and 4) and `dogs` for dog info.

### Real-Time Updates

Primary: **Supabase Realtime subscriptions** via `postgres_changes` on the `entries` and `classes` tables, filtered by show ID. Provides near-instant updates when scores are posted or class status changes.

Fallback: **Polling at 30-second intervals** for reconnection scenarios (network drop at a venue, Realtime channel failure). The polling layer activates only when the Realtime subscription is disconnected.

### Update Flow

1. Judge posts score → `entries` table updates → Realtime event fires
2. TV receives event → class card highlights briefly → in-ring/next-up shifts → progress count updates
3. All entries scored → `classes.is_scoring_finalized = true` → Realtime event fires
4. TV receives event → podium takeover (20s) → class removed from grid

### No Authentication

The route uses the Supabase anon key. All queries hit public views. RLS policies on underlying tables already permit public read access for show data.

## Component Architecture

```
TVDisplay/                          (page component)
├── useTVData.ts                    (hook: active classes + entries, realtime + polling)
├── useTVResults.ts                 (hook: completed classes + placements)
├── TVGrid.tsx                      (TV layout: responsive grid of class cards)
├── TVClassCard.tsx                 (single class: header, in-ring, next-up)
├── TVPodiumOverlay.tsx             (full-screen takeover with queue management)
├── TVPodiumCard.tsx                (single placement: medal, dog info, photo/silhouette)
├── TVMobileList.tsx                (mobile layout: scrollable list)
├── TVMobileClassCard.tsx           (mobile class card)
├── TVMobileResults.tsx             (mobile inline results)
├── TVConfetti.tsx                  (CSS confetti animation)
└── TVSoundToggle.tsx               (optional chime settings)
```

Shared:

- `BreedSilhouette.tsx` — SVG breed silhouette component (shared between TV and dog details page)

## Edge Cases

- **No active classes:** Show a "No classes currently in progress" message with show name and next scheduled class time (if available).
- **Show not found:** Show a "Show not found" error page.
- **Single class:** Grid collapses to a single centered card.
- **7+ classes:** Grid adds rows. On TV, cards shrink slightly to fit. On mobile, just scroll.
- **Network loss:** Polling fallback keeps data reasonably fresh. A subtle "reconnecting..." indicator appears in the header if Realtime is disconnected for >10 seconds.
- **Class finishes during podium:** Queue the next podium. Play sequentially.

## Out of Scope

- Voice announcements (separate todo)
- Score/result editing from the TV display (read-only)
- Authentication or role-based features
- Offline-first / service worker caching for the TV route (venue TVs have persistent internet; if not, myK9Q is the offline tool)
