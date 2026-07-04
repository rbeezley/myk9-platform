# Overlay Primitive Inventory

Inventory captured 2026-07-03 for `ux-shell-integrity-followups` Task 1.1.

## Shared Primitives

| Primitive | Shared implementation | Import/use count | Teardown posture |
| --- | --- | ---: | --- |
| Dropdown menu | `apps/myk9show/src/components/ui/dropdown-menu/dropdown-menu.tsx` | 41 | `DropdownMenu` defaults `modal={false}`. Existing Playwright regression covers an Entry Management row-actions menu close followed by an immediate Add entries click. |
| Popover and searchable popovers | `apps/myk9show/src/components/ui/popover/popover.tsx`, `apps/myk9show/src/components/ui/searchable-popover.tsx`, `apps/myk9show/src/components/ui/grouped-searchable-popover.tsx` | 44 | Base UI portal/positioner without a shared backdrop. Keep spot checks focused on ArmbandLookup/date-time/searchable picker surfaces. |
| Select | `apps/myk9show/src/components/ui/select/select.tsx` | 135 | Highest residual risk. `SelectContent` intentionally renders a full-screen `SelectPrimitive.Backdrop` at `z-[9998]`; teardown and nested-dialog behavior need focused spot checks before broader changes. |
| Sheet | `apps/myk9show/src/components/ui/sheet.tsx` | 9 | Intentionally modal. Built on Base UI Dialog so portaled Base UI popovers/selects inside sheets stay interactive. |
| Dialog | `apps/myk9show/src/components/ui/dialog/dialog.tsx` and related wrappers | 137 | Intentionally modal. Remaining concern is stale backdrop teardown or nested select/popover interaction after close. |
| Alert dialog | `apps/myk9show/src/components/ui/alert-dialog/alert-dialog.tsx` | 36 | Intentionally modal. Verify close restores page interaction in touched flows. |

## Existing Regression Coverage

- `apps/myk9show/src/test/e2e/entities/entriesUI.spec.ts` includes `entry row Actions menu teardown does not block the Add entries decision point`: it opens an Entry Management row actions menu, presses Escape, verifies the menu item disappears, clicks the Add entries decision point, and waits for the secretary registration wizard.
- `apps/myk9show/src/services/error/ignoredBrowserErrors.test.ts` covers the narrow benign ResizeObserver messages and verifies unrelated errors are not suppressed.

## Residual Task 1 Scope

- Task 1.2 is satisfied once the existing Playwright regression is run successfully.
- Task 1.3 remains open until select/combobox spot checks run against representative nested contexts.
- Task 1.4 is satisfied once the existing ignored-browser-errors unit test is run successfully.
