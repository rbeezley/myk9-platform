# Plan — Dependabot Remediation (post auto-fix wave)

**Date:** 2026-05-22
**Status:** Draft. Companion to [`dependabot-diagnostic-2026-05-22.md`](dependabot-diagnostic-2026-05-22.md).
**Author note:** the Phase 2 auto-fix PR in this same session cleared the in-range fixes (jspdf, turbo, lodash). This plan covers the rest — every item that needs a deliberate human decision because it requires a major bump, a transitive override, or a "no fix available" acknowledgement.

## What this plan is and isn't

It **is** a per-vulnerability decision register. Each item below is a discrete piece of work — usually one PR — with explicit entry criteria, blast radius, test coverage, and a rollback note.

It is **not** a single mega-PR. The whole point of bracketing major bumps as their own phases is so each one can be reviewed, deployed, and rolled back independently.

It is **not** an "audit every dependency" sweep. Only the packages currently flagged by Dependabot post-auto-fix are in scope.

## Headline numbers (after Phase 2 auto-fix)

| State                              | Critical | High | Medium | Low | Total |
| ---------------------------------- | -------- | ---- | ------ | --- | ----- |
| Pre auto-fix (Dependabot)          | 1        | 29   | 18     | 2   | 50    |
| Post Phase 2 (estimated)           | 0        | ~23  | ~16    | 1   | ~40   |
| Post **stale-alert close** rescan  | 0        | ~16  | ~16    | 1   | ~33   |
| Target post all phases             | 0        | 0    | ≤3     | ≤1  | ≤4    |

Estimates assume Dependabot closes the stale `vite@8.x`, `rollup<2.80.0`, `brace-expansion`, and `path-to-regexp<0.1.10` alerts on next rescan.

## Architectural commitments this plan must respect

1. **No major bumps bundled together.** Each major bump (undici, serialize-javascript, …) gets its own PR so the blast radius is reviewable and revertable.
2. **Overrides are last-resort.** Only use `pnpm.overrides` when the upstream owner won't release a fix in a reasonable window. Document every override with its CVE and an exit criterion ("remove when @vercel/node ships 6.x").
3. **Dev-only deps last.** Vulnerabilities only exercised at build / lint / type-check time are lower priority than runtime ones — but still tracked.
4. **No silent dismissals.** "Won't fix" is a documented decision in this plan, not a Dependabot alert dismissal.

## Ordering rationale

Order by *risk × exploitability × ease*:

1. **D1 — `serialize-javascript` override** — dev-only, transitive, patch-level override, 1 high + 1 medium. Cheap and clear.
2. **D2 — `tar` override** — dev-only, transitive, in-major patch override, 3 high. Cheap.
3. **D3 — `flatted` + `picomatch` + `markdown-it` + `smol-toml` + `ajv` overrides** — all transitive, all in-major patch fixes, mostly dev-only. Group into one "transitive patch overrides" PR.
4. **D4 — `minimatch` override (10.x line)** — transitive via eslint + typescript-eslint, in-major patch, 9 high. Single override.
5. **D5 — `@isaacs/brace-expansion` override** — transitive, patch override, 1 high.
6. **D6 — `undici` major bump (5 → 6)** — pulled by `@vercel/node`. Affects local dev `vercel dev` path only; not production. Higher blast radius than the others.
7. **D7 — `lodash` no-fix-available decision** — document and wait.
8. **D8 — minimatch older-major lines (3.x, 5.x, 9.x)** — investigate whether they're vulnerable to the same CVEs and override if so. Lowest priority; held by deeply-pinned eslint chain.

## Phase D1 — serialize-javascript major bump via override

**CVE:** GHSA-5c6j-r48x-rmvq (RCE via RegExp.flags) — high. Plus GHSA-qj8w-gfj5-8c6v (DoS) — medium.
**Current install:** `serialize-javascript@6.0.2` via `vite-plugin-pwa → workbox-build → @rollup/plugin-terser`.
**Fix:** `>= 7.0.5`.
**Scope:** dev-only (PWA service-worker minification at build time). No runtime exposure.

**Approach:** add `pnpm.overrides` in root `package.json`:

```json
{
  "pnpm": {
    "overrides": {
      "serialize-javascript": "^7.0.5"
    }
  }
}
```

**Risk assessment:** `@rollup/plugin-terser` calls `serialize(...)` with internal terser AST objects. Major version 7 changed the array-detection path (root cause of both CVEs) and dropped Node <14 support. Both apps target Node 22+. Risk is **low**.

**Tests:** run `pnpm build` in both apps. Verify the generated `sw.js` for myK9Show and myK9Q both load without errors in the browser console. Run E2E smoke tests if available (skipped per the parent task's directive; manual browser check is sufficient).

**Rollback:** remove the override, run `pnpm install`. No code changes needed.

**Exit criteria:** Dependabot rescan shows 0 serialize-javascript alerts.

## Phase D2 — tar override

**CVEs:** GHSA-9ppj-qmqm-q256, GHSA-qffp-2rhf-9h96, GHSA-83g3-92jg-28cx — all high. All symlink/hardlink path-traversal issues.
**Current install:** `tar@7.5.7` via `@vercel/node → @vercel/nft → @mapbox/node-pre-gyp` AND `supabase` CLI.
**Fix:** `>= 7.5.11`.
**Scope:** dev-only (vercel build dep, supabase CLI). Patch-level override within the same major.

**Approach:**

```json
{
  "pnpm": {
    "overrides": {
      "tar": "^7.5.11"
    }
  }
}
```

**Risk:** patch-level within v7 — API unchanged. Risk **very low**.

**Tests:** `pnpm install` + `pnpm build` + `pnpm dev:show` smoke test (verify the vercel function emulator still extracts its bundles). Run `pnpm exec supabase --help` to confirm the CLI still launches.

**Rollback:** remove override.

## Phase D3 — Transitive patch overrides (bundled)

Five small fixes bundled together because they're all patch-level overrides for transitive deps. Single PR; if any one breaks, partial revert is one-line.

| Package          | Current | Fix    | CVE(s)                               | Source                                          |
| ---------------- | ------- | ------ | ------------------------------------ | ----------------------------------------------- |
| `flatted`        | 3.3.3   | ^3.4.2 | GHSA-rf6f-7fwh-wjgh (high)           | eslint internal (logging)                       |
| `picomatch`      | 4.0.3   | ^4.0.4 | GHSA-c2c7-rcm5-vvqj (h), -3v7f (m)   | chokidar / micromatch chains (build watchers)   |
| `markdown-it`    | 14.1.0  | ^14.1.1| GHSA-38c4-r59v-3vqw (medium)         | likely mermaid or docs tooling                  |
| `smol-toml`      | 1.5.2   | ^1.6.1 | GHSA-v3rj-xjv7-4jmq (medium)         | wrangler / cloudflare-worker tooling (verify)   |
| `ajv`            | 8.6.3   | ^8.18.0| GHSA-2g4f-4pwh-qvx6 (medium)         | jsonschema chains (eslint config, openapi)      |

**Approach:** single override block at root `package.json`:

```json
{
  "pnpm": {
    "overrides": {
      "flatted": "^3.4.2",
      "picomatch": "^4.0.4",
      "markdown-it": "^14.1.1",
      "smol-toml": "^1.6.1",
      "ajv": "^8.18.0"
    }
  }
}
```

**Risk:** patch-level only. ajv's API hasn't changed in 8.x; picomatch's options surface is stable; flatted is internal to ESLint. Risk **low**.

**Tests:** `pnpm typecheck`, `pnpm lint`, `pnpm test` (both apps), `pnpm build` (both apps). If any package's caller compiles against the older API, typecheck will catch it.

**Rollback:** remove the offending entry from `overrides`.

## Phase D4 — minimatch 10.x override

**CVEs:** GHSA-7r86-cg39-jmmj, GHSA-23c5-xmqv-rm74, GHSA-3ppc-4f35-3m26 — all ReDoS in glob matching. 9 alerts.
**Current install:** `minimatch@10.1.1` pulled by `glob@11.x` in various build/test chains.
**Fix:** `>= 10.2.3`.
**Scope:** dev-time. Exploitability requires malicious glob patterns reaching the matcher; in our build pipeline these are static.

**Approach:**

```json
{
  "pnpm": {
    "overrides": {
      "minimatch": "^10.2.3"
    }
  }
}
```

**Caveat:** the override is *global* across the workspace, including older callers that pin to 3.x/5.x/9.x. pnpm overrides without a path qualifier replace all versions. This could break tools that depend on minimatch 3.x/9.x API.

**Safer alternative:** scope the override with a path:

```json
{
  "pnpm": {
    "overrides": {
      "glob>minimatch": "^10.2.3"
    }
  }
}
```

This only affects `minimatch` instances pulled via `glob` — the 10.x line. Older majors stay intact.

**Risk:** with the scoped override, risk **low**. With the global override, risk **medium** (eslint pins minimatch 3.x intentionally).

**Tests:** `pnpm lint` (catches eslint regressions), `pnpm typecheck`, `pnpm test`.

## Phase D5 — @isaacs/brace-expansion override

**CVE:** GHSA-7h2j-956f-4vf2 — uncontrolled resource consumption. 1 high.
**Current install:** check post-Phase-2 lockfile; this package may have already been displaced by the surgical update.
**Fix:** `^5.0.1`.

**Approach:** add to existing overrides block:

```json
{
  "pnpm": {
    "overrides": {
      "@isaacs/brace-expansion": "^5.0.1"
    }
  }
}
```

**Risk:** patch-level. Very low.

**Tests:** typecheck + lint + tests.

## Phase D6 — undici major bump (5 → 6)

**CVEs:** GHSA-vrm6-8vpv-qv8q + GHSA-v9p9-hfj2-hcw8 (high, WebSocket DoS) + GHSA-4992-7rv2-5pvq + GHSA-2mjp-6q6p-2qxm + GHSA-cxrh-j4jr-qwg3 + GHSA-c76h-2ccp-4975 (mediums) + GHSA-g9mf-h72j-4rw9 (undici 7.x — not in our tree, stale).
**Current install:** `undici@5.28.4` via `@vercel/node@5.6.15` (dev only).
**Fix:** `>= 6.24.0`.
**Scope:** dev-only — `@vercel/node` is the local serverless emulator for `apps/myk9show/api/**`.

**Approach:** **do NOT override undici directly.** `@vercel/node` 5.x intentionally pins undici 5.x because its `BunRequest` adapter calls into undici 5 APIs that changed in 6.x.

**Path A (preferred):** upgrade `@vercel/node` to `^6.x` (when released — check at PR time). The fix surfaces transitively.
**Path B (fallback):** add a `pnpm.overrides` for `@vercel/node>undici` to `^6.24.0`, then test ALL `apps/myk9show/api/**` functions in `vercel dev`. If any throws, revert and document.

**Risk:** **medium**. The vercel function path is part of our local dev / staging flow but not production-critical (production serves through Vercel's own runtime, which is independent of this package).

**Tests:** `pnpm dev:show` then exercise `/api/og`, `/api/email-*` endpoints. Check that vercel function logs show successful invocation.

**Exit criteria:** all 7 undici alerts close on Dependabot rescan.

## Phase D7 — lodash no-fix-available

**CVEs:** GHSA-r5fr-rjxr-66jc (high), GHSA-f23m-r3pf-42rh (medium).
**Current install:** `lodash@4.18.1` (after Phase 2).
**"Fix":** `>= 4.18.0` (per the advisory).

**State:** Phase 2 already updated to 4.18.1, which is the only published artifact >= 4.18.0. The advisory's `fixed_in: 4.18.0` is the GitHub Security Advisory's record but **lodash has never published 4.18.0 to npm** — only 4.18.1 (which contains the fix).

**Action:** Dependabot should close both alerts on next rescan because 4.18.1 satisfies "fixed in 4.18.0+". If alerts remain open after a rescan, file a Dependabot feedback ticket. Do not dismiss manually.

**Test:** none required (no code change).

**If alert persists:** the long-term answer is to migrate off lodash for the affected call sites (`_.template`, `_.unset`, `_.omit`) — we use these in a handful of places (find via `grep -rn "from 'lodash'" apps/myk9show/src`). Not in scope for this plan.

## Phase D8 — older minimatch majors (3.x, 5.x, 9.x)

**State:** `minimatch@3.1.2`, `5.1.9`, `9.0.5` are in lockfile via the eslint chain and `@typescript-eslint/*`.
**CVE applicability:** unclear — most of the minimatch CVEs target 10.x specifically; some may apply to older majors via the same algorithmic class (ReDoS).
**Recommendation:** investigate at PR time. If Dependabot still reports alerts after D4, scope further overrides:

```json
{
  "pnpm": {
    "overrides": {
      "minimatch@3": "^3.1.2",
      "minimatch@5": "^5.1.9",
      "minimatch@9": "^9.0.5"
    }
  }
}
```

(These are no-ops if our installs are already at the latest patch.) Or upgrade `@typescript-eslint/*` to a newer line that uses minimatch 10.x.

**Risk:** low — eslint's minimatch usage is internal config matching, fully sandboxed.

## Decisions log

| Date       | Decision                                                                 |
| ---------- | ------------------------------------------------------------------------ |
| 2026-05-22 | Auto-fix wave restricted to direct deps + targeted transitive packages. Blanket `pnpm update -r` was tried first and reverted because it pulled in scope-creep updates (`@supabase/supabase-js` 2.93→2.106 introduced TS strictness, `eslint-plugin-react-hooks` 7.0→7.1 added a new rule), neither of which were security-driven. |
| 2026-05-22 | Phase 3 ordering: dev-only patches first (D1–D5), then the riskier `undici` major (D6), then no-fix items (D7–D8). |
| 2026-05-22 | `pnpm.overrides` introduced for the first time; root `package.json` previously had no overrides. Every override entry must carry a CVE citation in this plan. |

## Testing requirements (each phase)

Every phase must, before merge:

1. `pnpm install` resolves cleanly (no peer warnings other than the pre-existing `workbox-build` one).
2. `pnpm typecheck` exits 0.
3. `pnpm lint` exits 0.
4. `pnpm test` exits 0 in both `apps/myk9q` and `apps/myk9show`.
5. `pnpm build` exits 0 in both apps (catches build-time regressions that typecheck misses).
6. Manual smoke: `pnpm dev:show` and `pnpm dev:q` start and the home page renders without console errors.

No phase is considered complete until the corresponding Dependabot alert count drops on the next push to `main`.

## Out of scope for this plan

- E2E (playwright) suite runs — too slow / flaky per parent-task directive. Run only if a specific phase touches code that E2E covers.
- Codebase-wide lodash removal (mentioned in D7) — separate effort if/when lodash becomes a real bottleneck.
- Migrating off `@vercel/node` entirely — only relevant if vercel itself goes EOL on the 5.x line.
