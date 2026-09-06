# MYK9-289 implementation plan

> **Status:** Complete — metadata reconciled 2026-09-05.
> Linked Linear issue was refreshed as Done during this implementation pass; archive the completed plan without changing historical scope.


## Scope

Make unsettled app API requests from the nightly route-health sweep visible in
the CI job log, while preserving the HTML report annotation for local triage.

## Testing phase

1. [x] Add a source-level regression assertion that the route-health failure path
   logs the pending URLs.
2. [x] Run the focused harness tests and the source-level regression test.
3. [x] Run `git diff --check` and review the final diff for unrelated changes.

Focused tests pass (6 tests). Repository typechecking passed through the app
test typecheck; the e2e typecheck helper could not start because the sandbox
denied its temporary IPC pipe with `EPERM`.

## Implementation

1. Update `assertAppApiRequestsSettled` to emit one tagged console line when
   settlement times out, including the route and pending URLs.
2. Keep the existing annotation so the HTML report remains useful.
