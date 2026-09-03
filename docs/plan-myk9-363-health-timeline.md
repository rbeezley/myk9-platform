# MYK9-363: Health timeline card affordances

> **Status:** Active

Request: implement MYK9-363

Contract: [MYK9-363](https://linear.app/myk9-platform/issue/MYK9-363).
Use the issue's static-card option: remove the section's no-op click callback and
only apply pointer/hover styling and a click handler when a real callback exists.
No duplicate surface: existing list-view editing remains the editing route.
No data, authorization, dialog, or persistence changes. This narrow bug fix uses
the lightweight workflow instead of OPSX.

## Implementation and testing

- [x] Prove missing-callback cards incorrectly advertise an action in timeline and grid views.
- [x] Remove the no-op callback and condition card styling/handler on callback presence.
- [x] Run focused timeline tests, including real callback and delete propagation coverage.
- [x] Run focused lint, formatting, and diff checks; record results.

## Evidence

- Before the fix, both static-card regression cases failed on the pointer class.
- After the fix, 32 tests passed across HealthTimeline, filters, and responsive suites.
- Focused ESLint, Prettier, and `git diff --check` passed.
- App-wide `tsc --noEmit -p tsconfig.app.json` produced no output for over a
  minute and was stopped; no full typecheck result is claimed.
- Shipping verification repeated all 32 focused tests and lint successfully.
  App-local `pnpm --filter @myk9/show typecheck` also stalled without diagnostics
  and was stopped. Broad typechecking remains a CI gate.
- Independent Codex review approved with no actionable findings; the reviewer
  separately ran all 12 HealthTimeline tests successfully.
- Local diff review confirms the section omits the no-op callback, and both timeline
  and grid cards share the conditional styling. Actual click callbacks still receive
  the event; Delete remains functional and does not trigger the card action.
- Branch: `codex/myk9-363`. Prepared for PR; merge remains pending.
