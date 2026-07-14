## Why

The launch audit found that one submitted entry could be shown as `Entry Submitted` in Browse Shows but as an empty `My Entries` tab in Show Detail, while the registration flow independently mixed submitted and cart-only state. This breaks an exhibitor's basic trust question—"Am I entered?"—at the moment they need a fast answer before a show.

Original request: **Resolve QA-STALE-DERIVED-STATE-035 — unify the exhibitor entry status shown across Browse Shows, Show Detail, and registration/cart surfaces, then add regression tests.**

## What Changes

- Add one typed submitted-entry projection for exhibitor-facing Show Detail state: owned history, active submitted entries, active class IDs, and explicit loading/error state.
- Use active submitted state for Browse Shows present-tense entry indicators and Show Detail's default tab/class badges; retain terminal rows as visible history in `My Entries`.
- Keep cart-only selections inside the existing registration workflow and label them `In cart`, never as submitted entries.
- Preserve loading and failure states instead of rendering a false zero-entry result when the authoritative read has not completed.
- Add regression coverage for active, terminal-history, cart-only, cold-store, loading, error, and touch-target cases.

Non-goals:

- No new exhibitor dashboard, route, dialog, data fetch, or payment workflow.
- No changes to entry ownership, RLS, submission, payments, or show-day operations.

Duplication check: no existing page is duplicated. This tightens the current Browse Shows, Show Detail, and registration/cart surfaces; deeper tasks continue to use their existing canonical pages.

## Capabilities

### New Capabilities

- `exhibitor-entry-state-consistency`: A consistent, owned submitted-entry state across existing exhibitor browse, show-detail, and registration surfaces.

### Modified Capabilities

- None.

## Impact

- Affected app code: Browse Shows state derivation; Show Detail tab/class/My Entries derivation; registration class labels; shared entry status selectors.
- Affected tests: projection, Show Detail, Browse Shows helper state, registration class-selection, and existing entry display tests.
- No database migration, shared-system mutation, new route, or online-only core read.
