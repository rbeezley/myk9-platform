# Result Reveal + Share Card Design

> **Status:** Complete in PR #851. Archived with the implementation plan.

Date: 2026-06-19

## Decision

Build the full emotional result moment, not a tiny polish pass. The feature lives inside My Entries, uses a dog-first reveal, and prompts softly when an exhibitor has a newly released qualifying result.

Non-qualifying, absent, excused, and disqualified results remain calm result information. They do not get a celebration prompt or share call to action.

## Goal

Turn a released qualifying result from a row state into a personal moment for the exhibitor. The result must feel easy to find, safe from premature disclosure, and worth sharing without making the rest of the app flashier.

This supports the exhibitor intent in `docs/INTENT.md`: results appear quickly, are easy to find, and are shareable.

## Duplication Check

This does not create a new results page. My Entries remains the owning surface for an exhibitor's own results. Class results remain the class-level surface. The reveal opens from My Entries or from a notification deep link into My Entries.

The share card is an export artifact, not a separate browsing surface.

## Product Shape

Released qualifying own-entry results show a soft "New result" prompt on the relevant class row in My Entries until the exhibitor opens it once. Opening the prompt shows a dog-first reveal with the dog photo and name first, followed by the result, placement when visible, class, show, date, time, and faults when those fields are visible.

The notification path opens the same reveal state through My Entries with `/exhibitor/entries?resultEntryId=<entryId>`. This keeps the experience linkable without making a new top-level destination.

Non-qualifying results stay visible in the existing result area. They do not open a reveal, show the "New result" prompt, or offer sharing.

## Architecture

Create a focused `apps/myk9show/src/features/result-card/` slice:

- `resultCardModel.ts`: pure builder that accepts already-gated entry, class, show, visibility, and dog data. It returns `ResultCardModel | null`.
- `ResultRevealDialog.tsx`: modal surface for qualifying result reveals.
- `ResultCard.tsx`: dog-first visual card used inside the reveal.
- `renderResultCardImage.ts`: Canvas 2D PNG renderer for the share image.
- `resultRevealSeen.ts`: localStorage helper keyed by entry id and a result release marker.

My Entries integrates the feature. `MyEntryCard` renders the soft prompt for qualifying results and opens the dialog. The notification monitor retargets own-entry results to the My Entries reveal URL.

No migration is needed. Do not read raw scored columns directly to build the card. The builder must consume only data that has already passed the release and visibility cascade.

## Visibility Rules

The builder returns `null` unless the entry has a released visible result and at least one meaningful result field can be shown.

The card follows the visibility flags:

- Show placement only when placement is visible.
- Show qualification only when qualification is visible.
- Show time only when time is visible.
- Show faults only when faults are visible.

If placement is withheld, a qualifying card can still show the Q result without rank. If time or faults are withheld, the renderer omits those rows.

## Share Behavior

Qualifying reveals include a share action. The share action renders a fixed 1080 by 1350 PNG with Canvas 2D. The image leads with the dog photo and dog name, then the result, class, show, and quiet myK9Show branding.

Sharing uses native file share when the browser supports `navigator.share({ files })`. Desktop and unsupported browsers download the PNG and fall back to the existing text share/copy path.

The app never posts directly to social platforms.

## Motion

Qualifying reveals use `canvas-confetti`, but only when the user has not requested reduced motion. The animation fires once when the reveal opens for a new qualifying result.

Non-qualifying result views use no celebration motion.

## Error And Fallback States

If the dog photo is missing or fails to load, the card uses the existing placeholder dog image.

If Canvas rendering fails, the dialog keeps the visual card open and shows a plain-language failure for sharing. Viewing the result must not depend on image generation.

If the deep link references an entry that is not visible to the user, not released, or not owned by the account, My Entries loads normally without a reveal.

## Testing

Unit tests cover:

- Result-card builder gating across released, withheld, qualifying, and non-qualifying states.
- Prompt visibility and seen-state behavior in My Entries.
- Reduced-motion behavior for confetti.
- Canvas renderer draw calls for dog name, result, show, class, placement visibility, and photo fallback.
- File-share branches: native share, download fallback, text copy fallback, and user cancellation.
- Notification URL retargeting with an assertion-first test for the exact action URL.

Run focused tests for the new feature and affected My Entries/notification modules, then run typecheck and lint before implementation is considered complete.

## Out Of Scope

- New top-level navigation.
- A standalone results browsing page.
- Auto-posting to social platforms.
- Server-rendered Open Graph images.
- Judge-name denormalization.
- Sharing for non-qualifying results.
