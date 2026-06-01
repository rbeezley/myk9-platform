# Show Desk Tools Collapse Design

Date: 2026-05-31

## Problem

The Show Desk tools sheet currently renders every tool at full height. That makes secretaries scroll through late entries, hospitality, broadcasts, incidents, delay scripts, access codes, volunteers, and tasks just to find the one tool they need. On show day, that extra scanning works against the secretary intent: "That was easy."

This should refine the existing `ShowDeskToolsSheet`. It must not add another page, drawer, route, or duplicate tool entry point.

## Goals

- Make the existing tools sheet easier to scan by collapsing each tool independently.
- Preserve all existing tool content and behavior.
- Remember each show's open/closed tool state locally.
- Keep attention-worthy tools visible without fighting the secretary's explicit choices.
- Add focused coverage for collapse, keyboard/accessibility behavior, persistence, and existing content rendering.

## Non-Goals

- No new tools page, drawer, tab, or navigation affordance.
- No redesign of the individual tool cards' internal forms.
- No server persistence for panel state.
- No changes to offline data paths or Supabase schemas.

## User Experience

The Tools trigger remains in the Show Desk surface. Opening the sheet shows the same tools in the same order, but each is wrapped in a compact collapsible section.

Each collapsed header uses the approved "title plus one-line summary" style:

- chevron indicating expanded/collapsed state
- clear tool title
- one-line summary of what the tool is for
- optional calm attention badge when the tool needs review

Selecting a header toggles only that tool. Expanded sections render the existing tool content unchanged.

## Default And Remembered State

The sheet receives the current `showId` and stores state under a per-show localStorage key, for example `show-desk-tools:<showId>`.

On first visit for a show:

- open one or two common tools by default
- open tools marked as attention-worthy
- keep the rest collapsed

After the secretary changes a section, their saved state becomes authoritative for that show. If a tool later has attention while saved collapsed, show the attention badge but do not force it open. The system should guide without undoing the secretary's choice.

If localStorage is unavailable or contains invalid data, the sheet silently falls back to defaults.

## Component Contract

Change `ShowDeskToolsSheet` from opaque children to structured tools:

```ts
interface ShowDeskToolSection {
  id: string;
  title: string;
  summary: string;
  content: ReactNode;
  defaultOpen?: boolean;
  attentionLabel?: string;
}
```

`ShowDeskToolsSheet` should accept:

- `showId`
- `tools`
- existing `toolCount` and `actionableCount` badge inputs

`ShowWorkbenchPage` will build the nine current tools as structured entries and pass their existing JSX as `content`.

## Accessibility

Each section header is a native button with:

- `aria-expanded`
- an accessible name containing the tool title
- a chevron marked decorative with `aria-hidden`

The button's default Enter and Space behavior handles keyboard toggling. Headers must keep at least 44px touch height.

## Error Handling

Storage read/write failures are non-blocking. They should not show a toast or modal because this is preference state, not show data. The sheet remains usable with default state.

## Testing

Focused tests should cover:

- Tools trigger badge and sheet open/close behavior still works.
- Tools render as collapsed sections after opening the sheet.
- Toggling one section expands/collapses only that tool.
- Keyboard interaction works through button semantics.
- Per-show state persists and reloads.
- Corrupted storage falls back to defaults without throwing.
- Existing tool content renders unchanged when its section is expanded.

If the persistence/default-state logic is extracted into a helper, add focused helper coverage as well.

## Implementation Notes

Prefer a small helper near `ShowDeskToolsSheet` for localStorage parsing and default state calculation if that keeps the component readable. Keep the implementation scoped to `apps/myk9show/src/features/show-map/ShowDeskToolsSheet.tsx`, its tests, and the `ShowWorkbenchPage` call site unless existing file size or clarity requires a sibling module.
