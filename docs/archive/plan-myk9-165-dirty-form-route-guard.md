# MYK9-165 Dirty-form route guard

> **Status:** Complete — metadata reconciled 2026-09-05.
> Linked Linear issue was refreshed as Done during this implementation pass; archive the completed plan without changing historical scope.


## Decision

Use option 1: migrate the app entry point to `createBrowserRouter` and
`RouterProvider`. Compose the existing route modules with
`createRoutesFromElements` so the app has one data-router navigation context
without duplicating route definitions.

Add one shared route-leave blocker for dirty forms and bulk result entry. The
dialog names the work at risk and offers Keep editing or Discard changes. The
existing panel Cancel path remains separate and continues to use its own
unsaved-changes dialog.

## Scope

- Replace the legacy `BrowserRouter` mount with a data router.
- Move the current route composition into the router definition and render an
  `Outlet` from the provider shell.
- Guard dirty `EditPanelWrapper` and `BulkResultEntry` navigation with the
  shared blocker.
- Remove the bulk-entry `beforeunload` fallback required by the issue's option 1
  acceptance criterion.
- Add an integration test that proves a dirty edit survives a blocked
  navigation and can be discarded explicitly.

## Testing

- Run the focused route-guard integration tests.
- Run the existing `EditPanelWrapper` tests and source-level toaster test.
- Run myK9Show typecheck and the focused route tests; report any unrelated
  pre-existing failures separately.
