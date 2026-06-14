# Phase 4A — Retire Duplicated Show-Day Surfaces Safely

## Context

Phase 4 of `docs/plans/2026-05-17-unify-myk9show-myk9q.md` retires duplicated show-day surfaces after the `/at-show` experience absorbs ringside use.

The real-device push-tap pilot exposed a final notification routing issue. PR #479 fixed the known service-worker stale-client bug and was merged, but staging still needs one more real-device confirmation. Because of that, this execution plan splits Phase 4 into two lanes:

- **Phase 4A, safe code cleanup:** remove legacy myK9Show duplicate pages/routes and alert-only code that now duplicates `/at-show`.
- **Phase 4B, gated sunset:** redirect or disable the standalone myK9Q deployment only after push-tap acceptance is complete.

## Duplication Question

Does this duplicate an existing page? Yes.

- `/exhibitor/show-day` duplicates `/at-show/:showId` for day-of class/run-order awareness.
- `/exhibitor/check-in/:entryId` duplicates ringside/check-in flow ownership now consolidated under `/at-show`.
- `useShowDayAlerts` duplicates the unified inbox + push fanout path.

Duplication is not justified. The work should redirect old entry points to existing surfaces and delete the duplicate implementation, not add a replacement page.

## Scope

### In Scope Tonight

1. Replace `/exhibitor/show-day` route with a calm redirect/fallback to `/at-show` when a show id is available, otherwise `/exhibitor/entries`.
2. Replace `/exhibitor/check-in/:entryId` with a redirect/fallback to `/exhibitor/entries` unless a reliable show/class target can be resolved without online-only ad hoc reads.
3. Remove `ShowDayPage`, `ClassCheckInPage`, and `useShowDayAlerts` if no remaining imports exist.
4. Remove route-registry preloads for deleted pages.
5. Add route regression tests for the legacy redirects.
6. Update `OPEN-TODOS.md` and the unification plan changelog with Phase 4A status.

### Explicitly Out Of Scope Tonight

1. Do not delete `apps/myk9q`.
2. Do not change the Vercel myK9Q project, domain aliases, or deployment settings.
3. Do not remove `useNotificationStore` until notification preferences, bell state, push subscription UI, and voice settings have a replacement owner.
4. Do not claim Phase 3 acceptance complete until staging confirms real-device push tap routing after PR #479.

## Implementation Notes

- Prefer redirects and existing pages over new UI.
- Keep `MyEntriesPage`; it remains the exhibitor home for entries.
- Preserve notification settings and push subscription controls unless a narrower follow-up migrates their state.
- If an old route lacks enough route params to deep-link to `/at-show/:showId`, use `/exhibitor/entries` as the calm fallback.

## Testing Phase

1. Focused route tests:
   - `/exhibitor/show-day` no longer imports/renders `ShowDayPage`.
   - `/exhibitor/check-in/:entryId` no longer imports/renders `ClassCheckInPage`.
   - Both legacy routes land on the expected existing destination.
2. Focused grep:
   - no imports of `ShowDayPage`, `ClassCheckInPage`, or `useShowDayAlerts`.
3. TypeScript:
   - `pnpm --filter @myk9/show typecheck`
4. Lint:
   - `pnpm --filter @myk9/show lint`
5. Build:
   - `pnpm --filter @myk9/show build`

## Exit Criteria

- Legacy duplicate page code is gone or intentionally retained with a documented blocker.
- Existing exhibitor entry flow still has a stable destination.
- `/at-show` remains the only day-of ringside route family.
- Phase 4B sunset remains gated on real-device push-tap acceptance.
