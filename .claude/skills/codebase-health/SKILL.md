---
name: codebase-health
description: "Use when asked where the tech debt is, to run a code-quality audit, rank churn hotspots, check static debt drift, plan refactors, or prepare a launch-milestone quality sweep. Consolidates the former code-quality-audit, hotspots, and improve skills."
user-invocable: true
argument-hint: "[--static | --churn | --plan | dimension-name]"
---

# Codebase Health

One entry point for "where is the debt and what should we do about it." Three modes, each with its full methodology in `references/`:

| Mode | Question it answers | Reference |
| --- | --- | --- |
| `--static` (default) | What maintainability debt exists right now? Repo-wide static audit across the June-2026 dimensions. | `references/static-audit.md` |
| `--churn` | Where does attention pay off most? Ranks files by git churn × size. | `references/churn-hotspots.md` |
| `--plan` | What should another agent implement? Read-only advisor survey producing prioritized, self-contained plans. | `references/advisor-plans.md` |

## Choosing a mode

- No argument or `--static` → run the static audit. A bare dimension name (e.g. `oversized-files`) scopes the static audit to that dimension.
- "what changes most", "where should I refactor first", "hotspots" → `--churn`.
- "audit and hand me plans", "what should we improve next" → `--plan`.
- A launch-milestone sweep runs `--static` and `--churn`, then synthesizes: hotspot rank is the tiebreaker for which static findings to fix first.

Read the matching reference file in full before starting — each contains the complete procedure, scoring, and output format. Do not blend procedures across modes; run them separately and synthesize at the end.

## Ground rules (all modes)

- Read-only on source: this skill never fixes code. Findings go to the report, Linear (team **MyK9-platform**), or an opsx proposal.
- Compare against the previous audit report (in `docs/`) when one exists, and state drift explicitly.
- Findings that justify work become an `opsx:propose` change or a Linear issue (team **MyK9-platform**) — never a silent chat-only summary.
