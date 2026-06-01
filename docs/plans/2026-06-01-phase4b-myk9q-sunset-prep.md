# Phase 4B — myK9Q Sunset Prep

## Goal

Prepare the standalone `apps/myk9q` Vercel deployment for sunset without flipping it live by default.

## Safety Boundary

Phase 4A is complete. Phase 4B remains gated by real-device push-tap acceptance. This branch may ship dormant sunset code, but it must not redirect the live myK9Q staging deployment unless the Vercel environment flag is explicitly enabled later.

## Duplication Question

Does this duplicate an existing page? No. This replaces the old myK9Q app shell with a migration handoff when sunset mode is enabled. The target experience already exists in myK9Show `/at-show`.

## Scope

1. Add environment-gated myK9Q sunset mode.
2. When enabled, render a focused migration page before the old myK9Q app initializes.
3. Link users to the myK9Show at-show/smart-input route.
4. Explain that notifications and installed-app shortcuts must be re-enabled/re-installed on myK9Show.
5. Preserve passcode query strings where possible.
6. Keep default behavior unchanged until `VITE_MYK9Q_SUNSET_ENABLED=true`.

## Out Of Scope

- Do not change Vercel project settings in this PR.
- Do not delete `apps/myk9q`.
- Do not touch legacy `myk9q.com`.
- Do not change myK9Show push behavior.

## Testing

1. [x] Unit test sunset config:
   - flag disabled by default
   - flag enabled only by explicit `true`
   - target URL defaults to myK9Show staging `/at-show`
   - query strings are preserved
2. [x] Unit test sunset handoff page:
   - renders the migration handoff copy
   - links to myK9Show `/at-show`
   - preserves passcode query strings
3. [x] `pnpm --filter @myk9/q typecheck`
4. [x] `pnpm --filter @myk9/q lint`
5. [x] `pnpm --filter @myk9/q build`

## Implementation Notes

- `apps/myk9q/src/main.tsx` now checks `VITE_MYK9Q_SUNSET_ENABLED` before lazy-loading the legacy app shell.
- When sunset mode is enabled, myK9Q renders a focused handoff page and does not initialize the old app, ringside styles, replication, or PWA update wiring.
- The handoff URL defaults to `https://myk9-platform-myk9show.vercel.app/at-show`, can be overridden with `VITE_MYK9SHOW_RINGSIDE_URL`, and preserves legacy query strings such as `?code=...`.
- This PR does not set any Vercel environment variables.

## Exit Criteria

- Dormant sunset mode is merged behind an env flag.
- The live myK9Q deployment remains unchanged until the flag is set.
- The final shared-system flip is a separate explicit approval step.
