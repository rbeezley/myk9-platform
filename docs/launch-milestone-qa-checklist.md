# Launch-Milestone QA Checklist

> **Status:** Active

Run this before each **launch milestone** (early-adopter cutover, public launch, major release). It consolidates the static **code-quality audit** and the **Dynamic QA** gates ([`plan-dynamic-qa-infrastructure.md`](plan-dynamic-qa-infrastructure.md), Phases 1–6) into one milestone-level sweep.

Most gates also run in CI on every PR (marked **[CI]**). Re-running them together on a clean `main` at milestone time catches two things per-PR checks miss: **drift accumulated on `main`** between PRs, and **cross-cutting interactions** no single PR exercised.

## How to use

- Run from a **clean worktree off the latest `main`** (`bash scripts/bootstrap-worktree.sh`).
- Tick each gate. **No silent skips** — any non-green or skipped gate gets a tracked `OPEN-TODOS.md` entry with context.
- Commands are from the repo root unless noted.

## 1. Build & type safety

- [ ] `pnpm typecheck` — green **[CI]**
- [ ] `pnpm lint` — green **[CI]**
- [ ] `pnpm build` — succeeds **[CI]**

## 2. Test suites (Phase 5 — suite health)

- [ ] `pnpm test:packages` — green **[CI]**
- [ ] `cd apps/myk9show && pnpm test` — full app suite green **[CI, sharded 1–3]**
- [ ] _Optional isolation probe:_ `cd apps/myk9show && npx vitest run --sequence.shuffle` — any new failures beyond the tracked cross-file test-isolation debt are real regressions (see the Phase 5 OPEN-TODOS item). Do **not** enable shuffle in CI until that debt is fixed.

## 3. Static code quality

- [ ] `pnpm qa:code-quality-ratchet` — no regressions vs `code-quality-ratchet.baseline.json` **[CI]**
- [ ] `/code-quality-audit` skill (`full`) — review the maintainability dimensions; file drift as `OPEN-TODOS.md`.

## 4. Money-path correctness (Phase 2 — mutation testing)

- [ ] `pnpm test:mutation` — runs all targets, or individually:
  - [ ] `pnpm test:mutation:cart` — cart fee math ≥ gate (baseline 87.50%)
  - [ ] `pnpm test:mutation:placement` — placement math ≥ gate (baseline 85.67%)
  - [ ] `pnpm test:mutation:score-validator` / `pnpm test:mutation:replication-conflict` — review survivors (documented baselines, not yet gated)

## 5. Database & security (Phase 3)

- [ ] `pnpm qa:db-drift:enum` — no enum/CHECK drift
- [ ] `pnpm qa:db-drift:functions` — deployed vs repo edge functions reconciled
- [ ] `pnpm qa:rls-smoke` — no RLS recursion
- [ ] `/security-audit` skill + Supabase advisors sweep ([`docs/audits/2026-06-proactive-qa/db-advisors.md`](audits/2026-06-proactive-qa/db-advisors.md)) — triage new ERRORs/WARNs

## 6. Performance & accessibility (Phase 6a)

- [ ] `pnpm --filter @myk9/show analyze:size` — initial-load payload within budget (ratchet **down** only) **[CI build job]**
- [ ] `pnpm --filter @myk9/show test:a11y` — no serious/critical a11y violations on public pages (`color-contrast` excluded + tracked until the theme-token fix lands)

## 7. Dependency health (Phase 6b)

- [ ] `pnpm audit --audit-level=high` — no high/critical advisories (also runs monthly via `.github/workflows/dependency-audit.yml`)
- [ ] `pnpm outdated -r` — review; decide the `@supabase/supabase-js` exact-version override (single-version enforcement) deliberately, bump-and-test or keep

## 8. Observability (Phase 4 — Sentry, live in production)

- [ ] Production events flowing — trigger one console error on the live site; confirm it appears in the Sentry **Issues** feed with PII shown as `[Filtered]`
- [ ] Source maps resolving — the issue's stack trace shows original `File.tsx:line`, not minified `index-*.js`

---

**Maintenance:** when a new repeatable QA gate is added, add it here in the matching section. When a tracked debt item (test-isolation, color-contrast) is fixed, remove its caveat so the gate enforces fully.
