# Shot List Reference

## Seeded accounts (staging)

| Role | Email | Password |
|---|---|---|
| Secretary | `e2e-secretary@test.myk9.com` | _shared — see `.env.local`_ |
| Club admin | `e2e-clubadmin@test.myk9.com` | _shared — see `.env.local`_ |
| Site admin | `e2e-admin@test.myk9.com` | _shared — see `.env.local`_ |
| Exhibitor | `e2e-exhibitor@test.myk9.com` | _shared — see `.env.local`_ |
| Judge | `e2e-judge@test.myk9.com` | _shared — see `.env.local`_ |
| Unauthenticated | (no sign-in) | — |

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
