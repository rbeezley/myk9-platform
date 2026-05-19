# Plan — Phase D Quick Broadcast

**Date:** 2026-05-18
**Status:** In progress.
**Parent plan:** [`docs/plan-show-day-sequencing.md`](plan-show-day-sequencing.md)

## Goal

Give the secretary a calm, fast way to send common show-day announcements to the whole show feed without composing from scratch.

This follows the Trial Secretary intent in [`docs/INTENT.md`](INTENT.md): during show-day chaos, the software should make the next message feel handled.

## PR 1 — Today Quick Broadcast Card

Deliverables:

- Add a Today workbench card with canned broadcast templates.
- Let the secretary edit title and message before posting.
- Post through the existing `show_announcements` lane at normal priority.
- Auto-expire quick broadcasts and include undo after posting.

Tests:

- Pure helper test for template defaults and expiry.
- Component test for selecting a template, editing copy, and posting the announcement payload.
- Workbench integration test proving the Today phase exposes the card.

## Later

- Push delivery remains gated until target audience and RLS behavior are verified.

## PR 2 — Today Class Message Card

Deliverables:

- Add a Today workbench card for canned direct messages to one selected class.
- Reuse the existing `send-targeted-message` edge function instead of adding a new delivery path.
- Keep push delivery gated; this slice sends in-app class messages only.

Tests:

- Pure helper test for class-specific canned copy.
- Component test for selecting canned copy and sending the targeted message payload.
- Workbench integration test proving the Today phase exposes the card.

## Later

- Push delivery remains gated until target audience and RLS behavior are verified.
