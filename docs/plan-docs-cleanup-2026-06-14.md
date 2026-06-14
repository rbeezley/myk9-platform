# Docs Cleanup Remediation Plan — 2026-06-14

## Problem

`docs/` holds 563 markdown files (41 MB) with **no index and no status convention**. A plan
for shipped code is indistinguishable on disk from an active one, so nobody can tell what is
complete, abandoned, or live.

## Decisions (confirmed with owner)

- **Disposition:** Archive — move dead docs to `docs/archive/` (preserve subfolder structure).
  Nothing deleted; git history intact; `docs/` becomes clean and reversible.
- **Scope:** Everything, including the 229 plugin-generated files in `docs/superpowers/`.

## Classification taxonomy

Every doc resolves to one of:

| Verdict | Meaning | Action |
|---|---|---|
| `KEEP-ACTIVE` | Plan/work still in progress or not yet started | stays in `docs/` |
| `KEEP-REFERENCE` | Living reference (ADR, architecture, roles, intent, ops runbook) | stays in `docs/` |
| `ARCHIVE-DONE` | Plan whose work shipped (merged PRs / code present) | → `docs/archive/` |
| `ARCHIVE-ABANDONED` | Superseded, redundant, or explicitly dropped | → `docs/archive/` |
| `ARCHIVE-SNAPSHOT` | Point-in-time audit/handoff with no remaining open items | → `docs/archive/` |

**Conservatism rule:** if completion can't be confirmed, default to `KEEP-ACTIVE` and flag it.

## Phases

- [x] **Phase 0 — Setup.** Created `docs/archive/`. Wrote this plan.
- [x] **Phase 1 — Superpowers.** Archived `docs/superpowers/` → `docs/archive/superpowers/` (229 files).
- [x] **Phase 2 — Classify.** Cross-referenced 334 hand-authored docs against merged PRs + codebase
      via five parallel agents. Result: 118 keep (52 active, 66 reference), 217 archive
      (~111 done, ~75 snapshot, ~26 abandoned).
- [x] **Phase 3 — Disposition.** `git mv`'d 217 docs + 3 orphaned asset trees into `docs/archive/`.
- [x] **Phase 4 — Index.** Built `docs/README.md` (living index, status column, anti-rot convention)
      and `docs/archive/README.md`.
- [ ] **Phase 5 — Commit.** Docs-only change; awaiting owner go-ahead (direct-to-main vs PR).

## Result

`docs/` markdown: **563 → 119 living** (incl. this index). 447 retired to `docs/archive/`
(217 hand-authored + 229 superpowers + 1 archive README). Nothing deleted; all recoverable.

## Anti-rot convention (documented in docs/README.md)

- New plans get a `> **Status:** Active | Complete | Abandoned` line under the title.
- When a plan's work merges, flip status to Complete and move the file to `docs/archive/`.
- `docs/README.md` is the single index; update it when adding/retiring a doc.
