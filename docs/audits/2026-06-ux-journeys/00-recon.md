# UX Journey Audit Recon

**Date:** 2026-06-12
**Scope:** Phase 1 recon for exhibitor and secretary journeys
**Status:** Draft

## Source Inventory

| Source | Purpose | Checked |
| --- | --- | --- |
| `docs/INTENT.md` | Role feelings and UX guardrails | Yes |
| `docs/goals/fall-2026-launch-readiness-scorecard.md` | Canonical golden-path steps | Yes |
| `docs/ux-audits/phase-1-summary.md` | April exhibitor findings | Pending |
| `docs/ux-audits/phase-2-summary.md` | April secretary findings | Pending |
| `docs/plan-show-map-workbench-collapse.md` | Intended secretary workbench boundary | Yes |
| `docs/plan-secretary-show-day-ux-consolidation.md` | Intended secretary routing boundary | Yes |
| `apps/myk9show/src/routes/` | Current route map | Yes |
| Light browser checks | Route existence and redirects | Pending |

Route inventory confirms the current app treats `/at-show/:showId` as the day-of class picker, `/exhibitor/entries` as the exhibitor show hub, `/secretary/dashboard` as the cross-show secretary home, and `/shows/:showId` / `/shows/:showId/show-desk` as the canonical single-show workbench and Show Desk surfaces. `/secretary/shows/:showId` is a legacy redirect. The consolidation plans define Show Desk as the operational hub and Entry Management as the bulk entry surface.

## Prior Finding Disposition

| Finding | April surface | Current status | Evidence | Follow-up phase |
| --- | --- | --- | --- | --- |

## Exhibitor Journey Map

| Scorecard step | Current surface | Route/component | Evidence | Audit notes |
| --- | --- | --- | --- | --- |

## Secretary Journey Map

| Scorecard step | Current surface | Route/component | Evidence | Audit notes |
| --- | --- | --- | --- | --- |

## Light Browser Checks

| Route | Expected behavior | Result | Evidence |
| --- | --- | --- | --- |

## Recon Gaps For Later Phases

| Gap | Why recon cannot close it | Recommended phase |
| --- | --- | --- |

## Duplication Notes

| Surface or task | Does this duplicate an existing page? | Recon note |
| --- | --- | --- |
| Secretary operational work | Yes, if rebuilt outside Show Desk | Current plans make `/shows/:showId/show-desk` the canonical single-show operational hub; `/secretary/shows/:showId` is a legacy redirect. Recon should prefer links into Show Desk over new surfaces. |
| Bulk entry approval/check-in | Yes, if rebuilt in Show Desk | Entry Management owns cross-entry and bulk workflows. Show Desk can deep-link to filtered Entry Management, but should not duplicate bulk tables. |
| Exhibitor show-day status | Yes, if rebuilt under old `/exhibitor/show-day` | `/at-show/:showId` and the My Entries show-day banner are the canonical day-of path. Old `/exhibitor/show-day` is a legacy redirect surface. |
