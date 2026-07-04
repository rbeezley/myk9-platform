## Why

The July UX walks found that shared shell behavior can still make otherwise-correct pages feel broken: stale overlays swallow clicks, broken-out pages lose the show workbench context, icon-only controls are unlabeled, role-inappropriate chrome leaks into exhibitor flows, and responsive primitives clip primary actions. This supports fall 2026 launch readiness by making the navigation, menus, search, overlays, and shared controls reliable enough for secretary/show-day pressure and simple enough for low-tech exhibitors.

## What Changes

- Finish the Phase 3 shell and interaction integrity follow-ups from `docs/plan-ux-walk-remediation-2026-07.md`.
- Sweep shared overlay primitives so dismissed dropdowns, popovers, sheets, selects, and dialogs do not leave inert portals or backdrops that intercept the next click.
- Rehome Manage Classes into the existing show workbench shell with the show header, section tabs, and truthful breadcrumbs.
- Complete the dead/unlabeled control sweep: icon-only buttons, disabled-primary explanations, public page title, progressbar names, and appendix inventory closure.
- Finish role-scoped chrome: profile/account consolidation and mobile Browse Shows table-mode verification, while preserving previously completed command-palette and staff/exhibitor label scoping.
- Complete dark-token, chip, heritage, ringside, and literal-color contrast work with regression tests.
- Complete shared responsive/semantics primitives: workbench hero truncation, toast docking, mobile singleton fixes, ringside action target sizing, and matrix re-run.
- Add or finish focused component, Playwright, and accessibility tests for the shell contract.
- Non-goals:
  - No new navigation system, replacement workbench, standalone class-management page, or duplicate entry-management surface.
  - No new profile surface beyond consolidating `/profile` and `/account` into one canonical existing destination.
  - No broad visual redesign outside the shell, primitive, and contrast defects named by the July UX plan.

Duplication answer: this change does not duplicate an existing page. It tightens existing shared chrome and reuses canonical surfaces; where a broken-out page exists, the fix is to place it back inside the existing show workbench shell or link to the canonical page with filters instead of creating another workflow.

## Capabilities

### New Capabilities
- `shell-interaction-integrity`: Defines the shared shell contract for overlays, workbench context, accessible controls, role-scoped chrome, contrast-safe tokens/chips, responsive primitives, and regression verification.

### Modified Capabilities
- None.

## Impact

- Affected app surfaces and primitives:
  - `apps/myk9show/src/components/layout/*`
  - `apps/myk9show/src/components/ui/dropdown-menu*`, `popover*`, `select*`, `sheet*`, `dialog*`, `data-table/*`, tabs/toolbar primitives, toast rendering, and shared button/icon patterns
  - `apps/myk9show/src/pages/secretary/ClassManagementPage.tsx`
  - show workbench, Show Desk, Entry Management, Browse Shows, profile/account, public show/heritage pages, ringside entry cards, and mobile singleton fixes called out in the July UX plan
- Affected design/system areas:
  - dark theme tokens, chip/badge contrast, 44px touch targets, responsive overflow affordances, role-scoped labels and actions
- Testing impact:
  - component tests for workbench shell rendering, role-scoped search/chrome, mobile table-mode gating, and primitive semantics
  - Playwright regression for overlay teardown and ringside exit paths
  - axe/runtime matrix checks for unlabeled controls, contrast, clipped primary actions, and sub-44px shared chrome
