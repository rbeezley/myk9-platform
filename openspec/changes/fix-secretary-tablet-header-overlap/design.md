## Context

`DetailHero` renders the existing canonical Setup and Show Desk header. When it has a 200px cover and header actions, its `sm` breakpoint absolutely positions those actions from 640px onward. At 768px, the date cover, wrapped show title, and status/action group compete for the same horizontal space, causing the status control to overlap the title.

The secretary's intended feeling is "That was easy": the show identity and its current published state must be immediately readable on a tablet. This is a layout-only change. Show data remains in its existing offline-first/query paths; no replication, mutation, API, or data-model behavior changes.

## Goals / Non-Goals

**Goals:**

- Keep the title, badges, status control, and overflow action separately readable at 768px.
- Retain the compact desktop composition when sufficient width exists.
- Preserve every current header control and its accessible behavior.

**Non-Goals:**

- No new header component, route, panel, or action.
- No changes to show status rules, publish readiness, or data reads.
- No visual restyling of the desktop hero beyond responsive flow placement.

## Decisions

1. Move absolutely positioned header actions from the `sm` breakpoint to `lg`.
   - At tablet widths, actions flow beneath the identity row, where wrapping increases height rather than causing overlap.
   - At desktop widths, actions remain right-aligned without changing the established composition.
   - Alternative considered: reserve a wider fixed right padding at tablet widths. Rejected because available width depends on the cover, title length, badge count, and action group; it still leaves a brittle collision threshold.

2. Add a focused source-level responsive guard alongside existing `DetailHero` tests.
   - The behavior is Tailwind breakpoint composition; the guard protects the exact `lg` flow/absolute transition that browser evidence exposed.
   - Browser verification remains the proof for the rendered layout at desktop, tablet, and mobile widths.

## Risks / Trade-offs

- [Risk] Tablet headers become taller. → Mitigation: the actions remain directly below the title and avoid a collision; this is more readable and tap-safe than preserving a shorter broken header.
- [Risk] Other `DetailHero` consumers may change at tablet widths. → Mitigation: retain the same controls and validate the common component's focused tests plus the secretary Setup/Show Desk pages.

## Validation Profile

- Risk: medium
- Validation: app
- Rationale: A shared production hero component changes responsive behavior for an active secretary workflow, but does not affect data or mutations.
