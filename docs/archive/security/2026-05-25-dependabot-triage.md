# Dependabot Triage — 2026-05-25

19 open alerts on `main` for `rbeezley/myk9-platform` after the repo flipped public on 2026-05-18.

**Severity counts:** 10 high · 8 medium · 1 low.
**Manifest:** all 19 alerts hit `pnpm-lock.yaml`. **All are transitive.** No direct dependency is vulnerable.
**Dependabot `scope` field:** every alert is tagged `runtime`, but that reflects each package's manifest classification relative to *its parent*, not whether the code runs in our deployed app. Real surface analysis below.

## Method

For each alert, traced the transitive chain through `pnpm-lock.yaml` to find the top-level consumer, then judged whether the vulnerable code path is reachable from:

- The browser bundle Vite builds for the SPA (myK9Show / myK9Q)
- The Vercel serverless functions we ship (`apps/myk9show/api/og-show.ts`, `og-show-image.tsx`)
- Build-time tooling only (Vite, Rollup, Workbox, `@vercel/node` CLI, etc.)

A transitive dep used only by build tooling cannot reach a deployed user — it lives in `node_modules` on the build machine and gets discarded after `vite build`.

## Bucket A — Immediate fix (runtime exposure)

**None.**

No alert touches code that runs in the production browser bundle or in our two Vercel serverless functions in a way that exposes the vulnerable path. `og-show.ts` and `og-show-image.tsx` are the only deployed Node.js code; both use `VercelRequest`/`VercelResponse` types and `fetch` to Supabase — no WebSocket, no `upgrade` header handling, no untrusted regex patterns. See Bucket B for the case-by-case reasoning on `undici` and `path-to-regexp` (the two candidates that *could* have landed here).

## Bucket B — Defer with reason (dev-only / no runtime path)

### Build-time tooling (Vite / Rollup / Workbox PWA build)

| # | Pkg | Sev | GHSA | Consumer | Why deferred |
|---|---|---|---|---|---|
| 22 | `rollup@4.57.1, 4.60.4` | high | [GHSA-mw96-cpmx-2vgc](https://github.com/rbeezley/myk9-platform/security/dependabot/22) | `vite@7.3.3`, `tsdown` | Arbitrary file write via path traversal — only exploitable if Rollup is fed attacker-controlled config/input. Our config is committed source. Build-time only. |
| 31 | `serialize-javascript@6.0.2` | high | [GHSA-5c6j-r48x-rmvq](https://github.com/rbeezley/myk9-platform/security/dependabot/31) | `@rollup/plugin-terser` (via `workbox-build`) | RCE via `RegExp.flags` — runs only inside Workbox PWA service-worker bundling. Inputs are our own asset list. Build-time only. |
| 77 | `serialize-javascript@6.0.2` | medium | [GHSA-qj8w-gfj5-8c6v](https://github.com/rbeezley/myk9-platform/security/dependabot/77) | Same as #31 | DoS variant of same surface. Same reasoning. |
| 45 | `picomatch@4.0.4` | high | [GHSA-c2c7-rcm5-vvqj](https://github.com/rbeezley/myk9-platform/security/dependabot/45) | `vite`, `@rollup/pluginutils`, `fdir`, `tinyglobby` | ReDoS via extglob — only fed our own glob patterns during build. Build-time only. |
| 47 | `picomatch@4.0.4` | medium | [GHSA-3v7f-55p6-f55p](https://github.com/rbeezley/myk9-platform/security/dependabot/47) | Same as #45 | Method injection via POSIX char classes. Same reasoning. |
| 15 | `ajv@8.20.0` | medium | [GHSA-2g4f-4pwh-qvx6](https://github.com/rbeezley/myk9-platform/security/dependabot/15) | `workbox-build` (PWA build) | ReDoS on `$data` schemas — Workbox passes its own static schemas. Build-time only. |

### `@vercel/node` (devDependency, but bundled into deployed functions)

`@vercel/node` is in `apps/myk9show/package.json` `devDependencies` and supplies the types/runtime for our two `api/og-show*` Vercel functions. Its transitive deps below ship to the Vercel Node runtime. Listed separately because the alerts *could* be runtime — they're not, for path-specific reasons:

| # | Pkg | Sev | GHSA | Why not exploitable here |
|---|---|---|---|---|
| 1 | `path-to-regexp@6.1.0` | high | [GHSA-9wv6-86v2-598j](https://github.com/rbeezley/myk9-platform/security/dependabot/1) | Backtracking-regex generator. Exploitable only when *untrusted* route patterns are passed in. Vercel uses it internally on `vercel.json` routing config (committed source). Our functions never call `pathToRegexp()` directly. |
| 39 | `undici@5.28.4` | high | [GHSA-vrm6-8vpv-qv8q](https://github.com/rbeezley/myk9-platform/security/dependabot/39) | WebSocket `permessage-deflate` unbounded memory. We don't open WebSocket clients. |
| 38 | `undici@5.28.4` | high | [GHSA-v9p9-hfj2-hcw8](https://github.com/rbeezley/myk9-platform/security/dependabot/38) | WebSocket `server_max_window_bits` unhandled exception. Same — no WS clients. |
| 37 | `undici@5.28.4` | medium | [GHSA-4992-7rv2-5pvq](https://github.com/rbeezley/myk9-platform/security/dependabot/37) | CRLF injection via `upgrade` option. We don't pass an `upgrade` option (only plain GET fetches to Supabase). |
| 36 | `undici@5.28.4` | medium | [GHSA-2mjp-6q6p-2qxm](https://github.com/rbeezley/myk9-platform/security/dependabot/36) | HTTP request/response smuggling. Fetches go to trusted Supabase only. |
| 4  | `undici@5.28.4` | medium | [GHSA-g9mf-h72j-4rw9](https://github.com/rbeezley/myk9-platform/security/dependabot/4)  | Unbounded `Content-Encoding` decompression chain. Counterparty is trusted Supabase. |
| 2  | `undici@5.28.4` | medium | [GHSA-c76h-2ccp-4975](https://github.com/rbeezley/myk9-platform/security/dependabot/2)  | Insufficiently random values. Not used for crypto/IDs in our functions. |
| 3  | `undici@5.28.4` | low    | [GHSA-cxrh-j4jr-qwg3](https://github.com/rbeezley/myk9-platform/security/dependabot/3)  | DoS via bad cert data. Counterparty is trusted Supabase. |

Caveat: even though every individual `undici` vuln is unreachable today, the cluster is large. The cleanest answer is to upgrade `@vercel/node` to a version that ships `undici@^6` rather than to keep arguing each CVE one at a time. See "Upgrade path" below.

### Vercel CLI internals (`@vercel/python-analysis`, `@vercel/static-config`) — not deployed

`@vercel/python-analysis` is only invoked when Vercel detects Python in the project. We have no Python. These alerts cannot affect us even at build time.

| # | Pkg | Sev | GHSA | Consumer |
|---|---|---|---|---|
| 9  | `@isaacs/brace-expansion@5.0.0` | high | [GHSA-7h2j-956f-4vf2](https://github.com/rbeezley/myk9-platform/security/dependabot/9)  | `minimatch@10.1.1` ← `@vercel/python-analysis` |
| 27 | `minimatch@10.1.1`              | high | [GHSA-7r86-cg39-jmmj](https://github.com/rbeezley/myk9-platform/security/dependabot/27) | `@vercel/python-analysis` |
| 23 | `minimatch@10.1.1`              | high | [GHSA-23c5-xmqv-rm74](https://github.com/rbeezley/myk9-platform/security/dependabot/23) | Same |
| 17 | `minimatch@10.1.1`              | high | [GHSA-3ppc-4f35-3m26](https://github.com/rbeezley/myk9-platform/security/dependabot/17) | Same |
| 44 | `smol-toml@1.5.2`               | medium | [GHSA-v3rj-xjv7-4jmq](https://github.com/rbeezley/myk9-platform/security/dependabot/44) | `@vercel/python-analysis` |

## Bucket C — Needs investigation

**None.** Every alert resolved to a clear classification above.

## Upgrade path (not auto-applied)

One single action would close most of the open alerts: bump `@vercel/node` (the parent of 9 of the 19 alerts: #1, #2, #3, #4, #36, #37, #38, #39, plus part of #44/9/27/23/17 via `@vercel/python-analysis`).

```bash
# In apps/myk9show
pnpm up @vercel/node@latest
```

Verify after upgrade:

1. `pnpm typecheck` (the `VercelRequest`/`VercelResponse` types are stable across recent majors but worth confirming).
2. Local test of `apps/myk9show/api/og-show.ts` against a known show ID — easiest via the Vercel dev server (`vercel dev`) or by hitting the staging deploy after pushing.

For the build-time bucket (rollup/serialize-javascript/picomatch/ajv), `pnpm dedupe` plus `pnpm up vite@latest workbox-build@latest tsdown@latest` should pull in patched transitive versions. None of these are urgent.

## Recommendation summary

- **No emergency.** The repo going public on 2026-05-18 does not introduce immediate exposure from these 19 alerts — every vulnerable code path is either build-time only or unreachable from our two deployed Vercel functions.
- **Plan a single hygiene PR.** Upgrade `@vercel/node` to clear the `undici` + `path-to-regexp` cluster (8 alerts including 3 high), then run `pnpm up` on `vite` / `workbox-build` to clear the rest. Expect to close 17–19 alerts with one PR; the `@vercel/python-analysis` ones may need a `pnpm.overrides` patch if Vercel hasn't rev'd that sub-package yet.
- **Re-triage after the upgrade PR.** Any alert that survives is worth a fresh look — by then it's no longer drowning in noise.

## 2026-05-25 — action taken

`@vercel/node@5.8.4` turned out to be the latest published version; Vercel hasn't shipped a release with patched `undici`/`path-to-regexp` yet. The "bump it" plan didn't work, so the actual fix used `pnpm.overrides` in the root `package.json` to force-upgrade the transitive deps across the workspace:

```json
"pnpm": {
  "overrides": {
    "undici": "^7.16.0",
    "path-to-regexp": "^8.2.0"
  }
}
```

Resolved to `undici@7.26.0` and `path-to-regexp@8.4.2`. The pre-existing `path-to-regexp-updated: npm:path-to-regexp@6.3.0` alias inside `@vercel/node` was left untouched (6.3.0 is already patched).

**Verification:**

- `pnpm install` clean, no new peer warnings introduced
- `pnpm typecheck` — all 23 workspace tasks pass, including `apps/myk9show/tsconfig.api.json` (the OG functions)
- `pnpm build:show` — full Vite + Rollup + Workbox service-worker build succeeds
- Pre-existing unmet peer `workbox-build@^7.4.1: found 7.4.0` warning is not regression — already present before this change

**Alerts that close once Dependabot re-scans (8 total):** #1 (path-to-regexp, H), #2 (undici, M), #3 (undici, L), #4 (undici, M), #36 (undici, M), #37 (undici, M), #38 (undici, H), #39 (undici, H). The partial cleanup also drops `rollup@4.57.1` (alert #22 still affected via `rollup@4.60.4` in Vite 7.3.3).

**Alerts that remain open (11 total) — all build-time-only or never-executed; per-bucket reasoning is above:**

| # | Pkg | Pinned by | Notes |
|---|---|---|---|
| 22 | rollup@4.60.4 | Vite 7.3.3 | Needs Vite 8 (deferred — major bump) |
| 15, 31, 45, 47, 77 | ajv, serialize-javascript, picomatch | workbox-build@7.4.0 ← vite-plugin-pwa@1.3.0 peer | Tried `workbox-build@^7.4.1` override — pnpm didn't honor it (peer-dep edge case in pnpm 9.15.9). Defer until vite-plugin-pwa is bumped or pnpm-workspace `overrides` syntax catches up. |
| 9, 17, 23, 27, 44 | @isaacs/brace-expansion, minimatch, smol-toml | `@vercel/python-analysis` ← `@vercel/node` | `@vercel/python-analysis` never executes (no Python in repo). Will close when Vercel publishes an update. |
