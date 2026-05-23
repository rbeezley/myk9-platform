# Plan — Secretary Dashboard Refocus (Stub)

**Date:** 2026-05-22
**Status:** **Stub.** Not yet drafted in detail. Pre-work required (observe post-Option-B usage patterns) before full plan can be written.
**Companion plan:** [`plan-show-map-workbench-collapse.md`](plan-show-map-workbench-collapse.md) (Option B). The "Relationship to Secretary Dashboard" section in Option B documents the current division of labor and flags this follow-up.

## The idea

After Option B ships, the per-show **Show Desk** workbench tab owns operational work for a single show. The **Secretary Dashboard** at `/secretary/dashboard` continues to exist but its scope narrows — it should focus exclusively on **cross-show concerns**, with anything that duplicates workbench surfaces removed or demoted.

## Current state (pre-Option-B)

The dashboard today carries a mix:

| Capability | Genuinely cross-show? |
|---|---|
| Multi-show list with phase status | Yes — primary value |
| Cross-show attention surface (via `attention.ts`) | Yes |
| Personal / cross-show tasks (via `secretary_tasks`) | Yes (personal); per-show tasks should live in Show Desk's Tools sheet |
| Messages tab | Probably yes (unclear without deeper audit) |
| Per-show navigation cards (`ShowPhaseCard`) | Yes — entry points to specific shows |
| Per-show attention items | **Redundant once secretary is in the workbench** |
| Other per-show surfaces (TBD) | Audit needed |

## Why a refocus

Once Option B ships and the workbench is the canonical per-show home, the dashboard's job is "where am I across all my shows?" — entry point + cross-show roll-ups. Anything per-show that the workbench already covers becomes a duplicate path. Two homes for the same data is the [Surface boundary](plan-show-map-workbench-collapse.md#surface-boundary-with-detail-pages) anti-pattern Option B explicitly addresses for detail pages — same logic applies to the dashboard.

## Why deferred (not bundled into Option B)

1. **Need post-Option-B usage observation.** Some dashboard surfaces will turn out to be heavily-used cross-show; others will go cold once workbench covers per-show. We can't predict which is which without watching real usage.
2. **Option B's critical path is already long.** Bundling a dashboard refocus would balloon the IA collapse PR count.
3. **Risk profile is different.** The dashboard is the secretary's *home screen*; changes there affect every workflow entry. Worth taking after the workbench is stable.

## Pre-work: observation period (~1 show cycle post-Option-B)

Before this plan can be fleshed out, observe:

1. **Which dashboard surfaces do secretaries actually open after Option B ships?** Specifically, does the cross-show attention surface still get checked, or do secretaries jump straight into a specific show's workbench?
2. **Do per-show tasks land on the dashboard or in the Show Desk Tools sheet?** (Phase B6.5 adds the Tools sheet entry for tasks.) Tracking which path is used will tell us if both are needed or one wins.
3. **Is the Messages tab actively used?** If yes, what kind of messages? Cross-show or per-show?
4. **Do the per-show `ShowPhaseCard` chips on the dashboard remain useful** once landing on `/secretary/shows/:id` goes directly to Show Desk by default?

## Pre-work: PO interview (5–10 min, after observation)

Once the observation period yields data, the PO should lock:

1. **What stays on the dashboard?** The narrowed scope.
2. **What gets removed entirely?** Anything purely duplicated.
3. **What gets demoted to a deep-link?** E.g., "Open this show's workbench" instead of in-line attention.
4. **Does the dashboard route change?** Currently `/secretary/dashboard`. Stays, or merges into a more general landing like `/secretary`?
5. **Is the Messages tab worth keeping in the dashboard, or does it move to its own surface?**

## Implementation candidates (to evaluate during full plan)

| Approach | Pro | Con |
|---|---|---|
| **(A) Tight refocus** — remove all per-show duplicates; dashboard becomes purely cross-show | Cleanest IA outcome | More user-visible change; needs careful migration |
| **(B) Gradual demotion** — keep duplicates but visually demote (collapsed sections, smaller text) | Lower risk; reversible | Doesn't fully solve "two homes" problem |
| **(C) Skin-deep restructure** — reorganize tabs/sections but keep same content | Lowest risk | Doesn't address the architectural problem |

**Recommendation (to be confirmed during full plan):** **(A)** Tight refocus. Half-measures preserve the "two homes" debt; might as well do it properly once.

## Soft impacts on Option B

These are already documented in Option B's [Relationship to Secretary Dashboard](plan-show-map-workbench-collapse.md#relationship-to-secretary-dashboard) section:

- Dashboard stays during Option B; no scope leak from this stub into Option B's PRs.
- Phase B1's `attention.ts` change carries an audit dependency for the dashboard's attention render — that work is already inside Option B's scope.
- Phase B6.5 adds the Show Desk Tools sheet entry for tasks; observation of how that interacts with the dashboard's task UI is part of this stub's pre-work.

## When to draft the full plan

After:
1. Option B Phases B0 through B6.5 have shipped and stabilized.
2. At least one full show cycle has been observed with the new workbench in production.
3. The PO interview has locked the five questions above.

Until then, this stub captures the idea and prevents it from being lost.

## Decision log

| Date | Decision | Source |
|---|---|---|
| 2026-05-22 | Stub created during Option B planning session. Dashboard refocus identified as logical follow-up once Option B's workbench narrows the dashboard's effective scope. Full plan deferred until post-Option-B observation data is available. | This session |
