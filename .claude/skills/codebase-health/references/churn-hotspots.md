---
name: hotspots
description: Rank source files by git churn × size to find where premium attention pays off most ("hotspots" analysis). Use when asked for a hotspot list, churn ranking, "what files change most", "where's the tech debt concentrated", or "what should I refactor/review first". Complements code-quality-audit (static, no history) and improve-codebase-architecture (survey, no churn) — this one adds the git-history signal neither has.
user-invocable: true
argument-hint: [months] [path-glob]
---

# Hotspots — churn × size ranking

Find where attention pays off most by combining two cheap, deterministic signals:

- **Churn = impact** — how often a file changes (straight from `git log`; objective, free, exact).
- **Size = opportunity proxy** — line count as a stand-in for complexity (a complex file nobody touches is fine; the *product* is what matters).

The expensive judgment (what's actually wrong inside a file, and the fix) is deliberately deferred to `improve-codebase-architecture` / `/improve` on the top result — do NOT spend model tokens estimating what git already knows precisely.

## Arguments

- First numeric arg = lookback window in **months** (default `6`). E.g. `/hotspots 3`.
- Any non-numeric arg = a **path glob** to scope to. E.g. `/hotspots secretary` → scope to secretary pages. Default scope: app + package source, excluding tests.

## Workflow

1. **Worktree check before any write** (this skill itself is read-only, but if it chains into a fix): `git branch --show-current` and `git rev-parse --git-dir --git-common-dir`.

2. **Compute churn** (the impact axis) — one `git log`:

   ```bash
   git log --since="<N> months ago" --name-only --format= -- \
     'apps/myk9show/src/**/*.ts' 'apps/myk9show/src/**/*.tsx' \
     'packages/**/*.ts' 'packages/**/*.tsx' \
     | grep -E '\.(ts|tsx)$' | grep -v test \
     | sort | uniq -c | sort -rn | head -20
   ```

   Narrow the globs when a path scope is given (e.g. `'apps/myk9show/src/pages/secretary/**'`).

3. **Compute size** (the opportunity proxy) — `wc -l` over the top ~10 churned files. Skip files that no longer exist (renamed/deleted) and note them.

4. **Filter cured files — the churn metric counts the cure as the disease.** A `refactor`/`extract`/`split`/`consolidate` commit *adds* churn, so a file you just cleaned up ranks high precisely *because* you fixed it. Check the most recent commit per top file and de-weight anything already addressed:

   ```bash
   git log -1 --format='%cd %s' --date=short -- <file>
   ```

   Classify by the latest commit's subject:
   - **Cured** — latest touch is `refactor(...)`, `extract`, `split … under 500`, `consolidate`, or a `polish`/mechanical sweep. Its high churn is the cleanup itself. Mark ✅ Addressed and **drop it from the actionable ranking** (still show it, struck through or in an "already addressed" group, so the user sees it was considered).
   - **Structural churner** — config/registry/route files (`*Config.ts`, `*Routes.tsx`, sidebar, `types/*.ts`) churn because the app grows, not because they're broken. Mark 🟡 and de-weight — high churn here is expected, not debt.
   - **Live debt** — latest touch is `fix`/`feat` and the file was never decomposed. This is the real signal; keep it in the ranking.

   Skip this filter only if the user explicitly asks for raw unfiltered churn.

5. **Normalize and rank** (live-debt files only). Map each axis to 1–5 by relative position within the result set (top file ≈ 5, bottom ≈ 1). Present a table: `Rank | File (clickable path) | Churn | LOC | Impact×Opp | Note`.

6. **Apply judgment — this is the part git can't do:**
   - Flag any file over **500 LOC** — it's tracked as known debt by `qa:code-quality-ratchet` (the ratchet fails *regressions* past the baseline, not every existing oversized file), so its "opportunity" score is grounded in a real metric, not a guess.
   - Look for **clustering**: do the top files share a surface/feature (e.g. the secretary show-detail pages)? A cluster usually means the real fix is *consolidation*, not N point-fixes — surface that explicitly. This aligns with the repo's "consolidate, don't duplicate" rule in `CLAUDE.md`.
   - For any UI/page finding, answer: "Does this duplicate an existing page? If so, why is duplication justified instead of a link?"

7. **Offer the hand-off, don't auto-run it.** Recommend `/improve` (improve-codebase-architecture) on the rank-1 *live-debt* file as the "premium attention on the high-value target" step. Run it only if the user asks.

## What this is NOT

- Not a quality verdict — high churn ≠ bad code (an actively-developed feature churns by design). Churn flags *where to look*, not *what's wrong*.
- Not a substitute for `code-quality-audit` (full static sweep) or `security-audit`. Route security, RLS, migration, and runtime-health concerns to their dedicated skills.
- Not precise to the decimal. LOC is a coarse complexity proxy; treat the 1–5 scores as buckets, not measurements.

## Example

`/hotspots 6` →

| Rank | File | Churn | LOC | Impact×Opp |
|------|------|------:|----:|:---------:|
| 1 | `pages/ShowDetailsPage.tsx` | 112 | 900 | 5 × 5 |

> Top 4 are all >500 LOC and three cluster on the secretary show-detail surface → the lever is consolidation, not isolated refactors. Want `/improve` on ShowDetailsPage.tsx?
