# Shot List Reference

## Seeded accounts (staging)

All e2e role accounts share **one** password, verified working against staging auth on 2026-06-25:

```
Myk9-E2E-Test!2026
```

| Role | Email |
|---|---|
| Site admin | `e2e-admin@test.myk9.com` |
| Secretary | `e2e-secretary@test.myk9.com` |
| Club admin | `e2e-clubadmin@test.myk9.com` |
| Judge | `e2e-judge@test.myk9.com` |
| Steward | `e2e-steward@test.myk9.com` |
| Exhibitor | `e2e-exhibitor@test.myk9.com` |
| Unauthenticated | (no sign-in) |

> **Notes**
> - `admin@myk9t.com` and `judge@myk9t.com` do **not** exist in `auth.users` — use the `e2e-admin@` / `e2e-judge@` accounts above.
> - The duplicate `club@myk9t.com` login was **removed** 2026-06-25; its `people` row remains as a seeded demo official but can no longer sign in. Use `e2e-clubadmin@`.
> - Password source of truth: GitHub Actions secrets (`E2E_*_PASSWORD`) + `apps/myk9show/.env.local`, mirrored by the `Myk9-E2E-Test!2026` constant in `src/test/e2e/fixtures/test-users.ts` and `scripts/setup-e2e-test-users.js`.
> - Staging has **HaveIBeenPwned leaked-password protection ON** — GoTrue rejects weak/pwned values (e.g. the former `Test1234!`) on any new password set. Re-provisioning must use a policy-passing password like the one above.

## Canonical seed show

**Heritage Scent Work show** — use this for all secretary and exhibitor screenshots unless a shot specifies otherwise.

```
Show ID: dededede-0000-0000-0000-000000000010
```

## Viewport sizes

| Label | Width × Height | Use for |
|---|---|---|
| Desktop | 1280 × 800 | Secretary, admin, club admin |
| Mobile | 390 × 844 | Exhibitor on show day; at-show ringside |
| Tablet | 768 × 1024 | Ringside — judge/steward |

## File locations

| Asset type | Location |
|---|---|
| Screenshots | `docs/screenshots/<ID>.png` |
| Shot list | `docs/training/screenshot-shot-list.md` |
| User guides | `docs/user-guides/<role>-guide.md` |
| Temp scripts | `/tmp/myk9-shots/` (not committed) |

## Dev server

```
http://localhost:5173
```

Confirm the dev server is running before capturing: `pnpm dev:show` from the project root. Run from a worktree that matches the branch you intend to document.

## Status values in the shot list

| Status | Meaning |
|---|---|
| `ready` | Can be captured now |
| `blocked: stripe` | Needs a live Stripe sandbox onboarding walkthrough |
| `blocked: seed` | Needs specific seed data not yet in staging |
| `blocked: flag` | _(retired 2026-06-23)_ formerly gated on `unified_ringside_enabled`; flag removed, shots now `ready` |
| `blocked: not-built` | Feature is not yet built |
| `blocked: date` | Only renders on show day |
