# Surface Contrast Hierarchy — Design Spec

**Date:** 2026-03-24
**Status:** Approved
**Problem:** Sidebar, header, page background, and cards all share the same warm cream tone in light mode (#f5f2ed), creating a monotone feel with no visual hierarchy between surfaces.

## Decision

Add two surface differentiations:

1. **Sidebar** — one step darker than the page background in both modes, creating a subtle anchoring surface
2. **Header** — add a warm-tinted bottom shadow so it reads as floating above the content

## CSS Variable Changes

### Sidebar (`--sidebar`)

| Mode  | Before    | After     | Delta                           |
| ----- | --------- | --------- | ------------------------------- |
| Light | `#f5f2ed` | `#f0ebe4` | Slightly darker warm cream      |
| Dark  | `#1a1a1e` | `#151518` | Slightly darker than background |

Background (`#f5f2ed` / `#1a1a1e`) and card (`#faf8f4` / `#26292e`) are unchanged. This creates three distinct surface levels: sidebar (darkest) → page → card (lightest).

### Header Shadow (`--shadow-header`)

New CSS variable for the header's bottom shadow:

| Mode  | Value                                                                     |
| ----- | ------------------------------------------------------------------------- |
| Light | `0 1px 3px rgba(180, 160, 130, 0.1), 0 1px 2px rgba(180, 160, 130, 0.06)` |
| Dark  | `0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2)`              |

The header keeps its existing `bg-background/80` opacity and `backdrop-blur-lg`. The shadow is additive — it makes the header read as a floating layer without changing the blur or translucency.

### Sidebar Border

The sidebar right border in `SidebarLayout.tsx` currently uses `border-border/30`. Update the sidebar border color to complement the new background:

| Mode  | Before             | After                                      |
| ----- | ------------------ | ------------------------------------------ |
| Light | `border-border/30` | `#e4ded5` (via CSS var `--sidebar-border`) |
| Dark  | `border-border/30` | `#2a2a2f` (via CSS var `--sidebar-border`) |

## Files to Change

### `apps/myk9show/src/index.css`

1. Update `--sidebar` in `:root` from `#f5f2ed` to `#f0ebe4`
2. Update `--sidebar` in `.dark` from `#1a1a1e` to `#151518`
3. Add `--shadow-header` variable in both `:root` and `.dark`
4. Add `--sidebar-border` variable in both `:root` and `.dark`

### `apps/myk9show/src/components/layout/AppHeader.tsx`

Add the header shadow to the nav element's className. The nav already has `border-b` which can remain — the shadow adds depth without replacing the border.

### `apps/myk9show/src/components/layout/SidebarLayout.tsx`

Update the sidebar border from `border-border/30` to use `--sidebar-border` for a color that complements the darker sidebar.

## What Stays the Same

- Header blur (`backdrop-blur-lg`) and opacity (`bg-background/80`) — unchanged
- Header layout — full-width, spans over sidebar
- Card and background colors — unchanged
- All sidebar component internals (UnifiedSidebar, RoleSidebar) — unchanged, they inherit via `--sidebar` CSS variable
- Shadow card variables — unchanged

## Testing

- Visual inspection in both light and dark modes
- Verify sidebar contrast is perceptible but subtle
- Verify header shadow appears on scroll (content should pass behind the glass header)
- Typecheck and lint pass
