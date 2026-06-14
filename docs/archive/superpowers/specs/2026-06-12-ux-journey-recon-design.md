# Design: UX Journey Audit Phase 1 Recon

**Date:** 2026-06-12
**Status:** Approved for planning
**Todo:** `UX Journey Audit — Exhibitor & Secretary — Phase 1 — recon`

## Purpose

Phase 1 recon turns the stale April page-level UX audit into a current journey map. It does not remediate UX. It classifies prior findings against today's app, maps the exhibitor and secretary golden paths to actual routes/components, and identifies which gaps later audit phases must walk in a browser.

The output is `docs/audits/2026-06-ux-journeys/00-recon.md`.

## Source Inputs

Recon uses these sources:

- `docs/INTENT.md` for role feelings and guardrails.
- `docs/goals/fall-2026-launch-readiness-scorecard.md` for the canonical golden-path steps.
- `docs/ux-audits/phase-1-summary.md` and `docs/ux-audits/phase-2-summary.md` for April findings.
- `docs/ux-audits/01-show-details.md` through `11-entry-management.md` when summary items need detail.
- `docs/plan-ux-journey-audit.md` for the active audit plan.
- `docs/plan-show-map-workbench-collapse.md` and `docs/plan-secretary-show-day-ux-consolidation.md` for intended surface boundaries.
- Current router and route registry files under `apps/myk9show/src/routes/`.

## Scope

The recon is static analysis plus light browser verification.

Static work:

- Disposition every April critical/high summary finding as `fixed`, `still-open`, `obsolete`, or `needs-browser-confirmation`.
- Map the exhibitor scorecard steps 1-8 to current route/component surfaces.
- Map the secretary scorecard steps 1-11 to current route/component surfaces.
- Flag route or surface drift, especially stale references to `/exhibitor/show-day`, legacy secretary day-of pages, and moved show-day responsibilities.
- Record the duplication question for any suspected overlap: does this duplicate an existing page, and if so, why would duplication be justified instead of a link?

Light browser work:

- Confirm route existence and redirect behavior for high-change surfaces.
- Capture evidence notes for routes that exist only through redirects or route aliases.
- Avoid full task walks, form submission, shared-system mutations, and UX remediation.

## Browser Verification Targets

Check only enough to confirm route shape:

- `/exhibitor/show-day` redirect behavior.
- `/at-show/:showId` class-picker route, using an existing safe test show id if one is already available locally.
- `/exhibitor/entries` as the current exhibitor show hub.
- `/shows/:showId` and `/shows/:showId/register`.
- `/secretary/dashboard`.
- `/secretary/shows/:showId` with `?phase=setup` and `?phase=show-desk`.
- `/secretary/shows/:showId/entry-management`, reports, results control, and submit-results routes where current routing exposes them.
- Legacy secretary routes only to document redirects, not to revive them.

If a safe show id is not available from local fixtures or current app state, mark that browser check as blocked and keep the recon moving.

## Output Shape

`00-recon.md` should contain:

1. **Source Inventory** — docs, route files, and browser targets checked.
2. **Prior Finding Disposition** — table with finding, old page, current status, evidence, and follow-up phase.
3. **Exhibitor Journey Map** — scorecard step, current surface, route/component, evidence, and audit notes.
4. **Secretary Journey Map** — scorecard step, current surface, route/component, evidence, and audit notes.
5. **Recon Gaps For Later Phases** — items that need Phase 2/3/4 browser walks, not fixes in recon.
6. **Duplication Notes** — suspected overlaps and whether a link/deletion/consolidation path is likely.

## Severity And Status Rules

Use these statuses consistently:

- `fixed` means current code/docs show the old issue was deliberately corrected, preferably with a PR or test reference.
- `obsolete` means the audited surface was deleted, redirected, or absorbed into a canonical surface.
- `still-open` means the same user-facing problem appears to remain on a current canonical surface.
- `needs-browser-confirmation` means static evidence is not enough.

Do not assign new launch severity unless a recon item clearly blocks a scorecard golden-path step. Otherwise, leave severity assessment to the Phase 2/3 browser audits.

## Testing And Validation

Because this phase writes audit documentation only:

- Run `git diff --check`.
- Run targeted `rg` checks for referenced route strings and source document names.
- Do not run app tests, typecheck, or lint unless TypeScript/app code changes.
- If browser route checks run, record the dev-server URL, route, result, and any blocked checks in `00-recon.md`.

## Non-Goals

- No UX remediation.
- No new UI proposals beyond recon notes and duplication questions.
- No route changes.
- No database writes, migrations, Supabase pushes, GitHub PR creation, or external service mutations.
- No full Phase 2/3 golden-path walks.
