# Admin Users UX Fixes

> **Status:** Active — metadata reconciled 2026-09-05.
> Richard owns reconciliation: existing historical implementation/status is preserved below; closure evidence is not independently established in this pass. Keep active pending that evidence.


## Scope

Improve the existing `/admin/users` surface without adding a new page:

1. Make summary metrics explicit about filtered versus platform-wide scope.
2. Preserve the roster's readable fields and primary actions on narrow screens.
3. Make profile navigation explicit and keyboard-accessible.
4. Remove duplicate result summaries while retaining useful table customization controls.

## Testing phase

- Add focused tests for metric labels/values, profile-link rendering, and responsive column metadata.
- Run the affected myK9Show Vitest files.
- Run formatting/diff checks and review the final diff for unrelated changes.
