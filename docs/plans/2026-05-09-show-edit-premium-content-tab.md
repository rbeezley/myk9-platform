# Show Edit Experience Tab Plan

## Goal

Combine show style selection and premium content editing into the existing show edit panel so secretaries configure the show experience in one calm setup flow.

## Context

- The show edit panel lives in `apps/myk9show/src/components/panels/edit/ShowEditPanel.tsx`.
- Its form is `apps/myk9show/src/components/panels/edit/ShowEditForm.tsx`, currently tabbed as `Basic Info`, `Personnel`, `Judges`, and `Fees`.
- Show style selection is currently inside `ShowEditBasicInfoTab`.
- Premium narrative and supplemental editing lives in `apps/myk9show/src/features/premium/GeneratePremiumPanel.tsx`, opened separately from `ShowDetailsPage`.
- `docs/INTENT.md` frames the secretary experience as "That was easy", so the change should reduce scattered setup work without hiding completion-critical premium fields.

## Product Direction

Use the show edit panel as the single show setup surface:

- Keep the existing edit panel pattern.
- Add a new `Experience` tab to `ShowEditForm`.
- Move the existing style picker out of `Basic Info` and into the premium-oriented tab.
- Bring the editable premium fields into that same tab: supplemental fields, generated narratives, print-friendly option, preview/download/publish actions.
- Remove the separate hero `Premium List` edit button once the tab is available.
- Keep `PremiumDownloadCard` and `LandingPageCard` on the details page as status/output cards, not editing entry points.

## UX Requirements

- Preserve the current secretary intent: fewer places to hunt, clear next action, no extra wizard.
- The tab label should stay short. If required premium content is missing, prefer a subtle status indicator in the tab content before adding noisy labels.
- Copy should distinguish:
  - `Show Experience Style`: visual/content package used by premium, landing page, entry form, and confirmation email.
  - `Shared Show Content`: show-specific narratives and supplemental details used across the premium list, landing page, entry form, and confirmation email.
- If organization is missing or unsupported, show the same plain-English alert currently used by `GeneratePremiumPanel`.
- Avoid making the edit panel feel like a publishing wizard. Publishing remains an explicit action inside the tab.

## Implementation Phases

1. Extract reusable premium content UI
   - Status: Complete.
   - Split `GeneratePremiumPanel` into a reusable content component plus a thin sheet wrapper.
   - Keep generation, preview, download, publish, diff logging, and error handling behavior equivalent.
   - Pass `showId`, `clubId`, and `showOrg` into the content component.

2. Add experience tab to show edit
   - Status: Complete.
   - Add a fifth tab to `ShowEditForm` using the existing tab pattern.
   - Move `STYLE_OPTIONS` and the style picker from `ShowEditBasicInfoTab` into a new `ShowEditPremiumTab`.
   - Render the extracted premium content UI below the style picker.

3. Simplify show details actions
   - Status: Complete.
   - Remove `premiumPanelOpen` state and the hero `Premium List` button from `ShowDetailsPage`.
   - Keep published premium and landing page cards visible below the hero.

4. Review naming and layout
   - Status: Complete.
   - Confirm the tab name is concise and readable on narrower panel widths.
   - Check that the five-tab layout does not wrap awkwardly.
   - If needed, use a responsive tab list layout rather than shrinking text.

## Testing Phase

- Status: Complete.
- Add or update unit tests for `ShowEditForm`/`ShowEditPremiumTab` to verify:
  - the experience tab renders in the edit panel,
  - style selection writes the real `style` field,
  - missing/unsupported organization messaging remains visible.
- Add a test or update existing page tests to verify `ShowDetailsPage` no longer renders the separate `Premium List` edit button for managers.
- Run focused tests from `apps/myk9show`, then run `pnpm typecheck` if the focused tests pass.
- If a test runner hangs for more than 30 seconds, stop and report the hang instead of retrying.

## Open Questions

- Decision: the tab is labeled `Experience` because the content is shared by the premium list, landing page, entry form, and confirmation email.
- Should opening the edit panel from a premium status card deep-link directly to the premium tab, or is the normal edit button enough for this pass?
- Should style changes immediately regenerate premium preview content, or should the existing regenerate action remain explicit?
