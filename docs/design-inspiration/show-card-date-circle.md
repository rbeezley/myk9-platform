# Show Card Design Inspiration — Date Circle

**Added:** 2026-03-18

## Description

Design mockup showing upcoming show cards with a circular date graphic on the left side. Key design elements:

- **Date circle:** Rounded square/circle with month abbreviation (e.g., "OCT") on top and day number ("12") below, giving instant visual date scanning
- **Show title + status badge:** Bold title with inline "Open for Entries" / "Closing Soon" / "Entries Closed" badges
- **Location + time row:** Venue and time in a single line with map pin and clock icons
- **Discipline tags:** Colored dot + label chips (e.g., "Conformation", "Obedience", "Agility")
- **Manage button:** Right-aligned action button per card
- **Next Event Spotlight sidebar:** Featured card with total entries, active rings, entry breakdown by class with progress bars, and morning schedule preview

## Layout

Each show card is a horizontal row:
`[Date Circle] [Title + Status Badge] [Location · Time] [Discipline Tags] [Manage Button]`

The date circle uses a subtle border/background to separate it visually, with the month in small uppercase text and the day in large bold text.

## Where to Apply

- `apps/myk9show/src/components/shows/ShowCard.tsx`
- `apps/myk9show/src/components/shows/browse/ShowCardGrid.tsx`
- `apps/myk9show/src/components/shows/UpcomingShows.tsx`
- `apps/myk9show/src/components/landing/UpcomingShowsSection.tsx`
- Secretary dashboard upcoming shows list
