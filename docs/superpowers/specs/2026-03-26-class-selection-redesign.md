# Class Selection Step Redesign

**Date:** 2026-03-26
**Status:** Draft
**Scope:** Registration wizard class selection step (`ClassSelectionStep` + `ClassSelectionStep.components`)

## Problem

The current class selection UI in the registration wizard has three issues:

1. **Verbose layout** — each class gets its own full-width row (checkbox + name + badges + fee). With 6+ classes per trial and multiple trials, the 350px scroll area requires excessive scrolling.
2. **Missing section labels** — classes like "Handler Discrimination Novice" don't show "A" or "B" suffixes. The code only appends the section when multiple classes share the same element+level combo in the trial, but the section should always display when the data has one (AKC Scent Work Novice has A/B; UKC Nose Work has A/B at every level).
3. **Hardcoded blue** — dog tabs use `#007AFF` and `blue-600` instead of the theme accent color CSS variable.

## Design Decisions

| Decision              | Choice                                            | Rationale                                                                                                |
| --------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Class layout          | Element cards with level chips                    | Eliminates repeated element names, scannable, compact                                                    |
| Trial navigation      | Collapsible sections with selection counts        | Secretary can see all trials at a glance, spot missed trials                                             |
| Section display       | Always show when present                          | AKC Scent Work only has A/B at Novice; UKC Nose Work has A/B at every level — data-driven, not hardcoded |
| Class restrictions    | None — no graying out                             | Dogs can enter lower levels; rules change; don't restrict                                                |
| Already Entered state | Pre-checked + visually distinct (teal/green chip) | Distinguishes committed entries from new selections                                                      |
| Dog tab color         | Theme accent color (CSS variable)                 | Consistent with app-wide theming                                                                         |
| Availability badges   | Deferred                                          | Address in a future iteration                                                                            |

## Component Architecture

### Files Modified

| File                                | Change                                                                                                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ClassSelectionStep.tsx`            | Replace flat class list with grouped-by-element data structure; replace fixed `ScrollArea` (350px) with collapsible trial sections (no fixed height)              |
| `ClassSelectionStep.components.tsx` | Replace `ClassCardRow` with `ElementCard` + `LevelChip`; replace `TrialSectionHeader` with collapsible `TrialSection`; update `DogTabTrigger` to use accent color |
| `myk9-registration-workflow.css`    | New styles for element cards, level chips, collapsible sections; remove old class card row styles                                                                 |

### New Component: `ElementCard`

Renders one element (e.g., "Handler Discrimination") as a card containing level chips.

```
Props:
  element: string                    — element name (card header)
  levels: Array<{                    — levels available for this element
    classId: string
    level: string                    — e.g., "Novice", "Advanced"
    section: string | undefined      — e.g., "A", "B"
    displayLabel: string             — computed: "Novice A", "Advanced", etc.
    isSelected: boolean
    isAlreadyEntered: boolean
  }>
  fee: number                        — entry fee (shown once per card)
  onToggle: (classId: string) => void
```

**Behavior:**

- Card header shows element name + fee
- Levels rendered as checkbox chips in a flex-wrap row
- Chips show: checkbox + display label (level + section if present)
- Selected chips: blue border + blue tint (theme accent)
- Already-entered chips: teal border + teal tint, checkbox pre-checked
- Single-level elements (e.g., Detective with no level): checkbox inline in the card header, no chips

**Display label logic:**

- If class has a level and a section: `"{level} {section}"` → "Novice A"
- If class has a level but no section: `"{level}"` → "Advanced"
- If class has no level: element name only (shown in header, no chips)

### Updated Component: `TrialSection`

Replaces `TrialSectionHeader`. Renders a collapsible section per trial.

```
Props:
  trialName: string
  trialType: string | undefined
  selectedCount: number              — number of classes selected in this trial
  isExpanded: boolean
  onToggle: () => void
  children: ReactNode                — element cards
```

**Behavior:**

- Header row: expand/collapse chevron + trial name + type badge + selected count
- Selected count styled with accent color when > 0, muted when 0
- First trial auto-expanded on mount; others collapsed
- Clicking header toggles expand/collapse

### Updated Component: `DogTabTrigger`

**Change:** Replace hardcoded `#007AFF`, `blue-600`, `bg-blue-600` with theme accent color. Use `text-primary`, `border-primary`, `bg-primary` (or the equivalent CSS variables) so the tabs match the app's configured accent color.

### Data Grouping

In `ClassSelectionStep.tsx`, the `classesWithTrials` memo currently produces a flat list. Change to group by trial → element:

```typescript
// New structure: Map<trialId, Map<element, ClassInfo[]>>
// ClassInfo includes: id, level, section, displayLabel
```

**Display label computation** (replaces current logic at lines 103-123):

```typescript
// Always include section when present — don't check for duplicates
const displayLabel = [cls.level, cls.section].filter(Boolean).join(' ') || undefined;
```

This is the key fix for the "Novice A/B" issue. The current code only shows the section when `elLevelCounts > 1`. The new code always shows it when the data has a section value.

## Visual Specification

### Element Card

```
┌─────────────────────────────────────────────────────┐
│ Handler Discrimination                    $10/class │
│                                                     │
│ [✓ Novice A] [  Novice B] [  Advanced]             │
│ [  Excellent] [  Masters]                           │
└─────────────────────────────────────────────────────┘
```

### Single-Element Card (no levels)

```
┌─────────────────────────────────────────────────────┐
│ [✓] Detective                                  $10 │
└─────────────────────────────────────────────────────┘
```

### Already-Entered Chip

```
[✓ Novice A]  ← teal border + teal background tint
              ← checkbox checked + disabled (entry already committed — can't un-enter via this wizard)
```

### New Selection Chip

```
[✓ Advanced]  ← accent/primary border + accent background tint
              ← checkbox checked, togglable
```

### Collapsible Trial Section

```
▼ Saturday Trial 1  [Scent Work]           3 selected
  ┌─ Handler Discrimination card ─┐
  ┌─ Interior card ─┐
  ┌─ Detective card ─┐

▶ Saturday Trial 2  [Scent Work]           0 selected
▶ Sunday Trial 1    [Scent Work]           0 selected
```

## Existing Features Preserved

These features from the current implementation must continue to work:

- **Cart integration** — class toggle still calls `handleClassToggle` which manages cart (exhibitor) or local state (secretary)
- **Jump height selection** — when a selected class requires jump height, show the dropdown below the element card (not inside the chip)
- **Waitlist** — full classes still offer "Join Waitlist" (show below the element card when relevant)
- **Handler assignment section** — `InlineHandlerSection` below the class selection area, unchanged
- **Cart summaries** — `DogCartSummary` and `OverallCartSummary` remain at the bottom
- **Dual-mode operation** — secretary/admin local state vs. exhibitor cart persistence

## Testing

- Unit tests for `ElementCard` — renders levels, handles toggle, shows section labels, handles single-element case
- Unit tests for `TrialSection` — expand/collapse, selected count display
- Unit tests for display label logic — AKC Scent Work (section only at Novice), UKC Nose Work (section at all levels), elements with no levels
- Update existing `ClassSelectionStep` tests for new component structure
- Visual verification: dog tabs use accent color, not hardcoded blue
