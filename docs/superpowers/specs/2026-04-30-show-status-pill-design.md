# Show Status Pill — Design Spec

**Date:** 2026-04-30  
**Status:** Approved

## Problem

Publishing a show (or pulling it back to draft) requires navigating Edit → Basic Info → Status dropdown → Save. There is no visible status indicator on the show details page, and no quick way to change it.

## Solution

A `ShowStatusPill` component in the show details header that shows the current status and, for actionable states, opens a one-item dropdown to transition it. Placed next to the Edit button in `secondaryActions`, visible only when `canManageShow` is true.

## Behavior

### Actionable states (secretary can change)

| Current status | Dropdown option | Result        |
| -------------- | --------------- | ------------- |
| `draft`        | Publish Show    | → `published` |
| `published`    | Move to Draft   | → `draft`     |

Selecting an option calls the update mutation immediately — no separate save step.

### Read-only states (no dropdown, no chevron)

`upcoming`, `in_progress`, `completed`, `cancelled` — rendered as a static badge only. These states are set by the system; the secretary cannot change them from the pill.

### Cancel action

Deliberately excluded. Cancelling a show without automated emails and refunds would mislead secretaries into thinking more happened than it did. A dedicated cancellation workflow (with emails and Stripe refunds) is future work.

## Visual design

Each status has a distinct color:

| Status      | Text               | Background  |
| ----------- | ------------------ | ----------- |
| Draft       | amber (`#fbbf24`)  | dark amber  |
| Published   | green (`#4ade80`)  | dark green  |
| Upcoming    | blue (`#60a5fa`)   | dark blue   |
| In Progress | orange (`#fb923c`) | dark orange |
| Completed   | muted (`#9ca3af`)  | dark gray   |
| Cancelled   | red (`#f87171`)    | dark red    |

Actionable pills include a small chevron (▾). Read-only pills do not.

## Architecture

### New component: `ShowStatusPill`

**File:** `apps/myk9show/src/components/shows/ShowStatusPill.tsx`

Props:

```ts
interface ShowStatusPillProps {
  showId: string;
  status: string;
}
```

Internally:

- Derives `transitions` from current status (empty array = read-only)
- Renders a static badge when `transitions.length === 0`
- Renders a `DropdownMenu` (shadcn/ui) when transitions exist
- On selection, calls `useUpdateShowMutation` (from `hooks/queries/useShowsDatabase.ts`) with `{ status: newStatus }`
- Shows a `toast.success` on success, `toast.error` on failure

### Modified: `ShowDetailsPage`

Adds `<ShowStatusPill showId={...} status={actualCurrentShow.status} />` to the `secondaryActions` block, left of the Edit button, guarded by `canManageShow`.

## Data

No new DB columns or migrations needed. Uses the existing `status` field on the `shows` table and the existing `updateShow` function in `showQueries.ts`.

## Testing

- Unit tests for `ShowStatusPill`: renders correct badge color per status, shows dropdown only for `draft`/`published`, calls mutation with correct new status on selection, renders read-only for all other statuses.
- No E2E tests required for this scope.
