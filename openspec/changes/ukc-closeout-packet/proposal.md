## Why

UKC Nosework is in fall scope, but the secretary closeout evidence shows only the UKC Trial Report is currently wired. Secretaries still need a practical packet path for official UKC entry/change-entry paperwork, judges books, score sheets, and packet preservation without rebuilding forms outside myK9.

This supports fall 2026 launch readiness by expanding UKC closeout coverage on the existing Reports surface, where secretaries already expect registry paperwork.

## What Changes

- Add official UKC packet templates for Nosework judges books and trial score sheet to `docs/UKC-forms/`.
- Register UKC Entry, Change Entry, judges books, and trial score sheet templates in the organization-form inventory.
- Add UKC Entry and Change Entry PDF fills that prefill known database values while leaving exhibitor/secretary-written fields editable.
- Expose UKC packet actions through the existing Reports page instead of creating a new closeout page.
- Prefer UKC dog registrations for UKC official forms without changing AKC form behavior.
- Add focused unit and Reports-page tests for the new UKC packet paths.

This does not duplicate an existing page. The implementation extends the existing Reports surface with registry-appropriate official PDF actions.

## Capabilities

### New Capabilities

- `ukc-closeout-packet`: Covers UKC Nosework official closeout packet templates, PDF fill behavior, registry-aware Reports actions, and tests.

### Modified Capabilities

- None.

## Impact

- Affected app code: `apps/myk9show/src/features/organization-forms/`, `apps/myk9show/src/pages/secretary/ReportsPage/`, `apps/myk9show/src/lib/reports/`, and `apps/myk9show/src/hooks/queries/useEntryFormData.ts`.
- Affected docs/assets: `docs/UKC-forms/` and secretary role tracking docs if status changes.
- No database migrations, shared-system writes, or new app routes.
