# MYK9-369 — registration dog picker search

> **Status:** Active — metadata reconciled 2026-09-05.
> Richard owns reconciliation: existing historical implementation/status is preserved below; closure evidence is not independently established in this pass. Keep active pending that evidence.


Request: implement fix for myk9-369

Use the existing exhibitor DogSelectionStep and shared SearchBar. This is a narrow
component fix, so the lightweight workflow applies instead of OPSX. No new page,
query, permission path, or draft pipeline is needed. Filter by trimmed,
case-insensitive call name; selected IDs remain controlled by the workflow.

## Implementation and testing

- [x] Add a regression at the existing DogSelectionStep rendered-component seam
      for small and 252-dog lists, filtering, clearing, and keyboard selection.
- [x] Reuse SearchBar, show no-match feedback, and distinguish load failures from
      empty data with retry. Preserve selected IDs through filters and remounts.
- [x] Run focused component tests, lint, and TypeScript checks.
- [x] Replay the real registration workflow at 1440x900, 768x1024, and 390x844;
      verify a late-list selection, Next/Back, draft restoration, and touch targets.

Keep the issue open until required evidence and merge are complete.

## Verification evidence

- 28 focused tests passed (DogSelectionStep and shared SearchBar).
- App TypeScript check passed with incremental caching disabled.
- Targeted ESLint and focused TypeScript compilation of both changed test files passed.
- Broad test TypeScript compilation stalled without output and was stopped; no claim of a broad pass.
- Playwright replay passed at all three widths against the issue's exact show fixture,
  using the canonical exhibitor with 252 dogs. Keyboard selection, filtering/clear,
  Next/Back, saved-draft restoration, and 44px control dimensions were verified.
- Shared-staging write guard enabled during replay; no entry submitted.
- Screenshot inspection found long names crowded the mobile selected badge; stack
  it below the name on mobile and wrap registration badges within the card.

Branch: `codex/myk9-369`. Implementation remains local pending PR and merge.
