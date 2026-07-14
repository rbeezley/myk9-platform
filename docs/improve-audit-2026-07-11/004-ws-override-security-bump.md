# 004 — Bump the `ws` override past its DoS patch

> Written against commit `15897d862` (2026-07-11).

## Why this matters

Root `package.json` → `pnpm.overrides` pins `"ws": "8.20.1"`. GHSA-96hv-2xvq-fx4p (memory-exhaustion DoS) affects `ws >=8.0.0 <8.21.0`; patched in `8.21.0`. The override actively holds every transitive `ws` at the vulnerable version — it is the **sole** `pnpm audit --prod` advisory (1 high, 0 critical). Real exposure is low (path: `packages/test-utils > vitest > jsdom > ws` — dev/test, not shipped runtime), but the pin is self-inflicted drift and free to fix.

## Steps

1. Root `package.json`: change `"ws": "8.20.1"` → `"ws": "8.21.0"` in `pnpm.overrides` (keep the exact-pin style used by the sibling overrides; do not switch to a range).
2. `pnpm install` (lockfile updates).
3. `pnpm audit --prod` → expect **0 advisories**. Record the output.
4. Full gates: `pnpm typecheck && pnpm lint`, `cd apps/myk9show && pnpm test` (jsdom is in the test path — the suite is the regression check for the bump).

## Out of scope

- Any other override. `pnpm outdated` general upgrades. Dev-scoped advisories.

## Done criteria

- `grep '"ws"' package.json` shows `8.21.0`; `pnpm audit --prod` clean; all gates green.

## Maintenance note

When adding a version to `pnpm.overrides`, note why (the sibling overrides are forward security pins); a backward pin below a known patch defeats the purpose. Check overrides when auditing any dep bump (existing project rule).
