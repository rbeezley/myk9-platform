# Wave 3A At-Show Phone Polish Plan

> **Status:** Implemented locally on branch `codex/wave3a-at-show-phone-polish`

**Goal:** Tighten the exhibitor phone-at-ringside experience without adding new surfaces.

**Source audit:** [`docs/audits/2026-06-ux-journeys/SUMMARY.md`](audits/2026-06-ux-journeys/SUMMARY.md)

## Scope

- `UX-P2-03`: Hide staff/report action-menu items from exhibitor at-show entry lists.
- `UX-P2-06`: Rename the persistent offline capability badge so it does not imply the device is currently offline.
- `UX-P3-01`: Bias at-show class scanning toward favorite and live classes before empty setup classes.

## Duplication Check

Does this duplicate an existing page? No. Wave 3A tightens existing at-show surfaces:

- Existing entry-list action menus receive role filtering.
- Existing offline capability pill receives clearer copy.
- Existing class picker receives better ordering.

No new page, dialog, report surface, or fast-path UI is introduced.

## Testing

- `packages/ringside/src/pages/EntryList/components/EntryListHeader.test.tsx`
  - Verifies print/report actions can be hidden while keeping refresh available.
- `apps/myk9show/src/features/at-show/slots/atShowLayoutSlotComponents.test.tsx`
  - Verifies the persistent pill says `Offline ready`, not `Offline`.
- `apps/myk9show/src/features/at-show/AtShowClassListPage.test.tsx`
  - Verifies favorite and live classes render before empty setup classes.

## Verification Run

- `cd packages/ringside && pnpm exec vitest run src/pages/EntryList/components/EntryListHeader.test.tsx`
- `cd apps/myk9show && pnpm exec vitest run src/features/at-show/AtShowClassListPage.test.tsx src/features/at-show/slots/atShowLayoutSlotComponents.test.tsx`
- `pnpm --filter @myk9/ringside typecheck`
- `pnpm --filter @myk9/show typecheck`
- `pnpm --filter @myk9/show lint`
- `git diff --check`

Browser smoke at 380px loaded `/at-show/show-1` without page or console errors, but the local browser profile stopped at auth, so fixture-backed phone re-walk remains part of the post-merge Wave 3 evidence pass.
