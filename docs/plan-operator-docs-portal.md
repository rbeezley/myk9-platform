# Plan: Gated Operator Docs Portal

> **Status:** Deferred (2026-06-27)
>
> **Interim decision:** the operator runbooks stay in the repo under `docs/operations/`,
> searchable via the editor/`grep` + the new [`operations/README.md`](operations/README.md)
> index. The gated portal is **not** being built now — it's the most work, and the sensitive
> runbook content (privileged-operations SQL + infra map, not secret *values*) is exactly what
> can't go on the public help site, so a public guide doesn't substitute for it. **Revive this
> plan if** searching the runbooks in the repo proves insufficient and a browser search UI is
> worth a separate password-gated Vercel deployment. The decided architecture below
> (SSR + middleware basic-auth + JSON search index) still stands when revived.

**Goal:** A private, **searchable** web portal for the site-admin/operator runbooks in
`docs/operations/`, so future-you can search "payout cron" or "auth email rate limit" at
11pm before a show instead of grepping the repo — without exposing secrets, SQL, or
connection details to the world.

**Why separate from the public help site:** `apps/docs` (help.myk9show.com) is static and
**world-readable** (only `noindex`). Vercel deployment protection is **all-or-nothing per
project**, so a gated operator portal cannot share that deployment — it needs its own Vercel
project with protection enabled. See [`docs/operations/README.md`](operations/README.md) for
the public/private split this enforces.

## Validation Profile

- Risk: medium — publishes sensitive runbooks; the **gate is the security control**, so
  verifying the gate actually blocks anonymous access is the critical test.
- Validation: build succeeds, every runbook renders, search returns hits, and an
  unauthenticated request is refused (the gate test).
- Rationale: the content already exists in-repo; this is a presentation+access layer.

## Architecture

Mirror the proven `apps/docs` machinery, pointed at a different source and gated:

- **New app:** `apps/operator-docs` — hand-rolled Astro (same as `apps/docs`), `output: static`.
- **Content source:** `docs/operations/*.md` (the runbooks + the new `README.md` index as the
  landing page). A `prepare-content.mjs` step copies them into the gitignored
  `src/content/runbooks/`, same pattern as `apps/docs`.
- **Gate (DECIDED — Option B, middleware basic-auth):** `output: 'server'` + `@astrojs/vercel`
  adapter + `src/middleware.ts` doing HTTP Basic Auth against an `OPERATOR_DOCS_PASSWORD` env
  var. SSR is required so the middleware runs on **every** request (a prerendered/static page on
  Vercel is served by the CDN and bypasses Astro middleware — which would defeat the gate).
- **Search:** SSR rules out **Pagefind** (it indexes static HTML at build time, which SSR
  doesn't emit). Instead, `prepare-content.mjs` emits a small `search-index.json` (title +
  headings + body text per runbook), and a client-side fuzzy filter renders results. Fine for
  ~7 small docs; no infra. (Pagefind on the *public* `apps/docs` is a separate fast-follow.)

## The one decision: how to gate it

| Option | How | Requires | Architecture impact |
| --- | --- | --- | --- |
| **A. Vercel Deployment Protection** | Toggle Password Protection (or Vercel Authentication) on the new Vercel project in the dashboard | Vercel **Pro** (password) or team SSO (Vercel Authentication) | None — site stays `output: static`, **zero auth code**. Simplest. |
| **B. Astro middleware Basic Auth** | `src/middleware.ts` checks an `OPERATOR_DOCS_PASSWORD` env var via HTTP Basic Auth | Any Vercel plan; needs `@astrojs/vercel` adapter + `output: server` | Site becomes SSR; a little auth code; works without Pro. |

**Recommendation: A if you have Vercel Pro** (cleanest, no code, just a dashboard toggle).
**B as the fallback** if you don't — it's in-repo and plan-agnostic. Everything else in this
plan is identical either way; only the final gating wiring differs.

## Phases

### Phase 1 — Scaffold (static, ungated)
1. `apps/operator-docs` Astro app mirroring `apps/docs` (config, `BaseLayout`, `[...slug].astro`,
   `index.astro` from `operations/README.md`, styles reused/imported).
2. `prepare-content.mjs` sources `docs/operations/*.md`; strip any internal-only markers; build
   a nav from the index ordering. Gitignore the generated dir.
3. `pnpm --filter @myk9/operator-docs build` succeeds locally; every runbook renders.

### Phase 2 — Search
4. Add Pagefind post-build + a search input in `BaseLayout`. Verify a query (e.g. "vault
   secret") returns the payout-cron section.

### Phase 3 — Gate (the security-critical phase)
5. Implement the chosen option (A: dashboard toggle + a note in the runbook; B: middleware +
   env var).
6. **Gate test:** an unauthenticated request to a deployed runbook URL is refused (401/redirect).
   This is the exit criterion — do not consider the portal done until this passes.

### Phase 4 — Vercel project + docs (operator steps)
7. Create the Vercel project (Root = `apps/operator-docs`, Build Command `pnpm build`), enable
   protection (Option A) or set `OPERATOR_DOCS_PASSWORD` (Option B). **Operator action.**
8. Document the portal + its URL + how to add a runbook in `docs/operations/README.md`.

### Phase 5 — Testing (required)
- Build is green in CI (add the app to the workspace build).
- A source-text test or build assertion that every file in `docs/operations/*.md` (except any
  explicitly excluded) is present in the generated portal content — so a new runbook can't be
  silently dropped.
- Manual gate verification recorded (the Phase 3 exit criterion).

## Out of scope
- Pulling the public help site's guides into this portal (different audience; stays separate).
- SSO/per-user accounts — a single shared gate is sufficient for a solo/small operator team.
