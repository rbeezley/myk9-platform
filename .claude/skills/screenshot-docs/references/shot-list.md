# Shot List Reference

## Seeded accounts (staging)

All e2e role accounts share **one** password. It is **not** spelled out here —
read it from `apps/myk9show/.env.local` (`E2E_*_PASSWORD`) or the GitHub Actions
secrets.

| Role | Email |
|---|---|
| Site admin | `testadmin@myk9t.com` |
| Secretary | `secretary@myk9t.com` |
| Club admin | `clubadmin@myk9t.com` |
| Judge | `judge@myk9t.com` |
| Steward | `steward@myk9t.com` |
| Exhibitor | `exhibitor@myk9t.com` |
| Unauthenticated | (no sign-in) |

> **Notes**
> - `admin@myk9t.com` and `judge@myk9t.com` do **not** exist in `auth.users` — use the `e2e-admin@` / `e2e-judge@` accounts above.
> - The duplicate `club@myk9t.com` login was **removed** 2026-06-25; its `people` row remains as a seeded demo official but can no longer sign in. Use `e2e-clubadmin@`.
> - Password source of truth: GitHub Actions secrets (`E2E_*_PASSWORD`) + `apps/myk9show/.env.local`. The shared password was **rotated 2026-06-25** — never spell it out in code or docs; read it from those env sources.
> - Staging has **HaveIBeenPwned leaked-password protection ON** — GoTrue rejects weak/pwned values (e.g. the former `Test1234!`) on any new password set. Re-provisioning must use a policy-passing password.

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
