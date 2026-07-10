# Account Menu and AskQ Navigation Design

**Date:** 2026-07-10  
**Status:** Approved in conversation

## Goal

Make AskQ recognizable and make the avatar menu easier to scan without adding another page, panel, or navigation surface.

## Design

- Replace the generic message icon with a compact speech-bubble icon containing a `Q`. Use the same icon in the desktop header and avatar menu.
- Label the action `AskQ`; the existing panel and toggle behavior remain unchanged.
- Keep AskQ in the avatar menu so it remains available when compact layouts hide the desktop header action.
- Group the menu in this order:
  1. Identity and connection/save status
  2. Account and plan management
  3. AskQ and Help & Guides
  4. Appearance and About
  5. Sign out
- Replace separate Subscription and Pricing destinations with one contextual plan item:
  - Premium or trial user: `Plan & billing`, linking to `/subscription`
  - Free user: `View plans`, linking to `/pricing-page`
- Replace the two technical status labels with one calm status message:
  - Online and settled: `All changes saved`
  - Online and pending: `Saving changes...`
  - Offline: `Offline — changes saved here`
- Shorten the theme action to `Light mode` or `Dark mode`, describing the mode the action will activate.
- Render Sign out with normal menu emphasis; reserve destructive color for hover/focus feedback.

## Existing Surfaces and Duplication

This does not duplicate an existing page. AskQ continues to open the existing `AskQPanel`. The avatar-menu action is a responsive access path for the same action, and the billing links are consolidated into one destination per account state.

## Components

- Add a small reusable `AskQIcon` component alongside layout components.
- Update `AppHeader` and `AccountMenuContent` to use it.
- Keep status selection in `AccountMenuContent`; no new state or service is required.

## Accessibility

- Preserve the `AskQ Assistant` accessible name on the icon-only header button.
- Keep labeled menu actions and existing minimum header touch targets.
- The custom icon is decorative wherever adjacent text or an accessible button name already identifies the action.

## Testing

- Update account-menu tests first and confirm they fail against the current implementation.
- Cover contextual plan label/destination, consolidated status copy, new group order, shorter appearance copy, AskQ label, and neutral Sign out styling.
- Keep the existing header interaction test and assert the new icon is rendered consistently.
- Run focused layout tests, TypeScript checking for myK9Show, and formatting/diff checks.

## Out of Scope

- Changes to AskQ behavior, subscription logic, help content, account pages, or global navigation.
- A new pricing, support, or appearance surface.
