# Spec: Consistent Entity Creation Triggers

**Date:** 2026-04-14  
**Status:** Approved

## Problem

"Add new" entry points are inconsistent across the app. Some entities are reachable only from empty states (Shows), some from inline buttons buried in tabs (Trials, Classes), and some have no persistent trigger at all. Users — especially secretaries new to the platform — have no reliable place to look when they want to create something.

## Solution

Every page that owns a creatable entity gets a `+ New [Entity]` button pinned to the top-right of its `<h1>` header row. Same component, same position, every time. Empty-state CTAs are preserved alongside the header button — they serve new users who need guidance, while the header button serves returning users who just want to act.

## Button Specification

- **Component:** shadcn `<Button size="sm">` with `<Plus className="h-4 w-4 mr-2" />` icon
- **Label:** `New [Entity]` (e.g., "New Show", "New Trial")
- **Position:** Top-right of the page `<h1>` row, consistent with existing secondary actions (e.g., "Clone Show")
- **Variant:** Default (filled) — this is the primary action on each page

## Page Mapping

| Page                       | Route                      | Button Label   | Opens                                                  |
| -------------------------- | -------------------------- | -------------- | ------------------------------------------------------ |
| Secretary Dashboard        | `/secretary/dashboard`     | `+ New Show`   | Show Creation Wizard (`/secretary/create-show/wizard`) |
| Browse Shows               | `/shows`                   | `+ New Show`   | Show Creation Wizard — **secretary/admin only**        |
| Show Detail — Trials tab   | `/shows/:showId`           | `+ New Trial`  | Add Trial dialog                                       |
| Trial Detail — Classes tab | `/trials/:trialId/classes` | `+ New Class`  | Class Creation Wizard                                  |
| Entries                    | `/secretary/entries`       | `+ New Entry`  | Registration Wizard (`/secretary/register/:showId`)    |
| Dogs                       | `/dogs`                    | `+ New Dog`    | Add Dog panel                                          |
| People                     | `/people`                  | `+ New Person` | Add User dialog                                        |

## Empty States

Empty-state CTAs are **kept as-is** on all pages. They coexist with the header button:

- **Header button** — always visible, for returning users who know what they want
- **Empty-state CTA** — only visible when the list is empty, for new users who need context and encouragement

The "Create your first show" empty state in `PipelineDashboard` is preserved. The existing empty-state-only `<Button asChild>` (currently the only way to create a show when `shows.length === 0`) is supplemented by — not replaced by — the header button.

## What Does Not Change

- The wizards, dialogs, and panels themselves are untouched
- "Clone Show" stays as a secondary `variant="outline"` button on the dashboard alongside `+ New Show`
- All existing routes, store logic, and form behavior are unchanged

## Out of Scope

- Floating Action Button (FAB) — removed from scope; `DelightfulFAB` component stays but is not wired up
- Bulk import / CSV creation flows
- Mobile-specific layout adjustments

## Testing

Each added button requires a unit test verifying:

1. The button renders on the page
2. Clicking it triggers the correct navigation or opens the correct dialog/panel
