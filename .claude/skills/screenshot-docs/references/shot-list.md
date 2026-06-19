# Shot List Reference

## Seeded accounts (staging)

| Role | Email | Password |
|---|---|---|
| Secretary | `secretary@myk9t.com` | `TestPass4567!` |
| Club admin | `club@myk9t.com` | `TestPass4567!` |
| Site admin | `admin@myk9t.com` | `TestPass4567!` |
| Exhibitor | `e2e-exhibitor@test.myk9.com` | `TestPass4567!` |
| Judge | `judge@myk9t.com` | `TestPass4567!` |
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
| `blocked: flag` | Gated on `unified_ringside_enabled` flag (DEV-only as of 2026-06-19) |
| `blocked: not-built` | Feature is not yet built |
| `blocked: date` | Only renders on show day |
