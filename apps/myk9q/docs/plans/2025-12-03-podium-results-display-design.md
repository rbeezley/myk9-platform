# Podium Results Display - Design Document

**Date:** 2025-12-03
**Status:** Approved
**Scope:** New `/results` page + TVRunOrder integration for displaying class placements in podium style

---

## Overview

Display class placements (1st through 4th) in an engaging podium-style format. Mobile-first design with a dedicated `/results` page, plus integration into TVRunOrder for big-screen displays.

### Goals

1. **Mobile-first results viewing** - Exhibitors can check placements on their phones as classes complete
2. **Big-screen integration** - TVRunOrder rotates through both in-progress and completed results pages
3. **Respect visibility settings** - Honor existing visibility configuration (immediate, class_complete, manual_release)
4. **Engaging visual design** - Celebratory animations, AKC ribbon colors, podium-style layout

---

## Requirements Summary

| Aspect | Decision |
|--------|----------|
| **Primary use case** | Mobile results viewing + live event big-screen display |
| **Page structure** | Dedicated `/results` page + TVRunOrder integration |
| **Layout** | Hybrid - vertical stacked on phone, horizontal podiums on tablet/desktop |
| **Filtering** | By element (5) and level (5) |
| **Novice A/B** | Displayed as separate class cards |
| **Visibility** | Respects existing visibility settings cascade (show → trial → class) |
| **Data refresh** | Poll every 30 seconds, results accumulate as classes complete |

---

## Component Architecture

### Shared Podium Components

```
src/components/podium/
├── PodiumCard.tsx          # Single class results with 1st-4th placements
├── PodiumPosition.tsx      # Individual placement (handler, dog, breed, ribbon)
├── PodiumGrid.tsx          # Responsive grid of multiple PodiumCards
└── podium.css              # Shared styles with CSS custom properties
```

### Results Page (new)

```
src/pages/Results/
├── Results.tsx             # Page shell with filters + PodiumGrid
├── Results.css
├── hooks/
│   └── useResultsData.ts   # Fetch completed classes, handle filtering
└── components/
    └── ResultsFilters.tsx  # Element/level filter dropdowns
```

### TVRunOrder Enhancement (extend existing)

```
src/pages/TVRunOrder/
├── TVRunOrder.tsx          # Enhanced with page type awareness
├── hooks/
│   └── useTVDisplayData.ts # Extended to include completed classes
└── components/
    ├── ClassRunOrder.tsx   # Existing (in-progress classes)
    └── TVPodiumPage.tsx    # New (completed results page for rotation)
```

---

## Visual Design

### Ribbon Colors (AKC Traditional)

| Place | Color | CSS Variable |
|-------|-------|--------------|
| 1st | Blue (#1e4b94) | `--podium-first` |
| 2nd | Red (#c41e3a) | `--podium-second` |
| 3rd | Yellow (#f4c430) | `--podium-third` |
| 4th | White (#f0f0f0) | `--podium-fourth` |

### Gradient Enhancements

```css
--podium-first-gradient: linear-gradient(135deg, #1e4b94 0%, #2d5aa8 100%);
--podium-first-glow: 0 0 20px rgba(212, 175, 55, 0.4);

--podium-second-gradient: linear-gradient(135deg, #c41e3a 0%, #d63050 100%);

--podium-third-gradient: linear-gradient(135deg, #f4c430 0%, #f7d048 100%);

--podium-fourth-gradient: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
```

### Element Icons

| Element | Icon |
|---------|------|
| Container | 📦 |
| Interior | 🏠 |
| Exterior | 🌲 |
| Buried | 🦴 |
| Handler Discrimination | 🎯 |

### Animations

**Entrance Sequence (TV mode & first load):**
1. Podium platforms rise from bottom (staggered: 1st→2nd→3rd→4th)
2. Winner cards fade in + slide down onto podiums
3. 1st place gets subtle golden shimmer/pulse
4. Optional: Confetti burst on 1st place (tasteful, 2-3 seconds)

**Micro-interactions (desktop):**
- Hover on card → gentle lift + shadow expansion
- Respects `prefers-reduced-motion` for accessibility

---

## Responsive Layouts

### Mobile (< 640px) - Vertical Stack

```
┌─────────────────────────────┐
│  Container Novice A         │
├─────────────────────────────┤
│  🏆 1st Place               │
│  Sarah Mitchell             │
│  "Biscuit" - Golden Retriever│
├─────────────────────────────┤
│  🥈 2nd Place               │
│  Tom Richardson             │
│  "Pepper" - Border Collie   │
├─────────────────────────────┤
│  🥉 3rd Place               │
│  ...                        │
├─────────────────────────────┤
│  4th Place                  │
│  ...                        │
└─────────────────────────────┘
```

### Tablet/Desktop (≥ 640px) - Horizontal Podium

```
┌────────────────────────────────────────────────────────┐
│              Container Novice A                        │
├────────────────────────────────────────────────────────┤
│                      ┌───────┐                         │
│        ┌───────┐     │  1st  │     ┌───────┐          │
│        │  2nd  │     │       │     │  3rd  │  ┌─────┐ │
│        │       │     │ ████  │     │       │  │ 4th │ │
│        │ ███   │     │ ████  │     │ ██    │  │ █   │ │
│        └───────┘     └───────┘     └───────┘  └─────┘ │
└────────────────────────────────────────────────────────┘
```

---

## Results Page (`/results`)

### URL Structure

```
/results                          → All completed classes
/results?element=buried           → Filter by element
/results?level=novice-a           → Filter by level
/results?element=buried&level=novice-a → Combined filters
```

### Features

- **Pull-to-refresh** on mobile
- **Auto-refresh toggle** (default off)
- **Sticky filter bar** - stays visible while scrolling
- **Deep linking** - filters preserved in URL

### Empty States

**No results yet:**
> 🏁 No results available yet
> Results will appear here as classes complete scoring

**No filter matches:**
> No results match your filters
> [Clear Filters]

---

## TVRunOrder Integration

### Page Rotation Sequence

```
Page 1: In-Progress Classes (existing ClassRunOrder)
Page 2: In-Progress Classes (if > 4 classes)
Page 3: Completed Results (TVPodiumPage) ← NEW
Page 4: Completed Results (if > 2 completed)
→ Loop back to Page 1
```

### Header Indicators

```
┌─────────────────────────────────────────────────────────────┐
│  Saturday AM Trial                    ○ ○ ● ○  Page 3/4    │
├─────────────────────────────────────────────────────────────┤
│  IN PROGRESS        or        🏆 COMPLETED RESULTS          │
└─────────────────────────────────────────────────────────────┘
```

### Keyboard Controls

| Key | Action |
|-----|--------|
| `Space` | Pause/resume rotation |
| `←` `→` | Previous/next page |
| `R` | Jump to results pages |
| `I` | Jump to in-progress pages |

### Configuration Options

- Results page timing (default: 45s, same as in-progress)
- Show results pages toggle (on/off)
- Results per page (1, 2, or auto-fit)

---

## Data Flow

### Results Page Hook

```typescript
useResultsData(trialId, licenseKey) {
  // Fetch completed classes where results are visible
  // Apply element/level filters
  // Return: { completedClasses, filters, setFilters, isLoading }
}
```

### TVRunOrder Hook Extension

```typescript
useTVDisplayData(trialId, licenseKey) {
  // Existing: fetch in-progress classes → in-progress pages
  // New: fetch completed classes → results pages
  // Combine into unified page list
  // Return: { pages, currentPage, navigation }
}
```

### Visibility Integration

```typescript
// Check visibility before displaying results
const canShow = await getVisibleResultFields({
  classId,
  trialId,
  licenseKey,
  userRole,
  isClassComplete: true,
  resultsReleasedAt
});

if (canShow.showPlacement) {
  // Include in results display
}
```

### Role-Based Display

| Role | Behavior |
|------|----------|
| Admin/Judge | See all results immediately |
| Steward | See results per visibility settings |
| Exhibitor | See results per visibility settings |
| Public (TV) | See results per visibility settings |

---

## Component Props

### PodiumPosition

```typescript
interface PodiumPositionProps {
  placement: 1 | 2 | 3 | 4;
  handlerName: string;
  dogName: string;
  breed: string;
  armband?: number;
  animate?: boolean;
}
```

### PodiumCard

```typescript
interface PodiumCardProps {
  className: string;       // "Container Novice A"
  element: string;         // "Container"
  level: string;           // "Novice"
  section?: string;        // "A" or "B"
  placements: PodiumPositionProps[];
  variant?: 'compact' | 'full';
}
```

---

## Performance Considerations

- **Batch visibility checks** to avoid N+1 queries
- **Cache visibility settings** per session
- **Poll every 30 seconds** (sufficient for live events)
- **Paginate results** if needed (unlikely to exceed 20-30 classes)

---

## Future Enhancements

1. **Real-time updates** via Supabase subscriptions
2. **Custom SVG icons** for elements (replace emojis)
3. **Photo integration** - show dog photos on podium
4. **Share results** - generate shareable image of podium
5. **Sound effects** - optional celebration sounds on TV display
