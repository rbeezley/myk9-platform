## Context

See `proposal.md` for motivation. Seven styled-landing hooks currently read the same show, trial, entry-query, registry, and live-experience inputs, then independently derive overlapping values and return seven mostly parallel types. `HeadlineLandingPage` reuses the heritage hook as an eighth presentation. The default public detail path separately maps classes and entry counts in `ShowDetailsPage.publicClasses.ts`.

The preceding public-landing truthfulness work in PR #1851 changes date/stale-read behavior in overlapping files. MYK9-259 remains isolated from that open branch and will reconcile with it before review rather than importing its unrelated branch history.

Public show and trial reads already use the established replication-backed path with documented anonymous fallbacks. This change does not add a query or mutation lane; it consolidates derivation and preserves the existing offline-first behavior.

## Goals / Non-Goals

**Goals:**

- Make shared show facts structurally impossible for a style adapter to omit.
- Keep style-specific presentation metadata local without repeating factual derivation.
- Represent entry-count query failure explicitly through `number | null`.
- Preserve the exhibitor intent, “This respects my time,” by retaining useful show details during a partial read failure.
- Fix only the accessibility and responsive defects enumerated in MYK9-259.

**Non-Goals:**

- Unify the eight component trees or CSS themes.
- Move public-show facts to another page or create a new route.
- Change replication, PostgREST permissions, database schema, or entry mutations.
- Generalize every style-specific display type where the semantics genuinely differ.

## Decisions

### 1. Shared base data plus narrow style adapters

Create a shared `LandingData` contract and `useLandingShowData(show, currentTrial, allTrials)` hook under `features/_shared/landing`. It owns common dates, venue, registry language, supplemental facts, normalized trials/judges, fees, entry count/limit, journey steps, and entry URL. Existing style hooks become narrow adapters that spread or map the shared result and add only genuine presentation fields such as brand colors, padded trial labels, or editorial copy shapes.

Alternative: keep seven hooks and only add missing fields. Rejected because it leaves the repeated derivations that caused the issue and permits future fact divergence.

Alternative: make all eight pages consume one exact presentation type directly. Rejected because style-specific structures such as banner judge labels and magazine editorial groupings are legitimate view-model concerns.

### 2. Null represents an unavailable count

The shared hook reads `isError` from the existing entry query and emits `entryCount: null`; successful empty reads remain `0`. Count components render an em dash and suppress percentage/capacity math when the value is null. The default public class mapping receives entry-read availability and assigns nullable `ClassInfo.entryCount` values consistently.

Alternative: retain `number` and pass a separate error flag everywhere. Rejected because the count value remains easy to misuse as zero and doubles the state each consumer must coordinate.

### 3. Partial failure stays local

`ShowDetailsPage` will no longer gate the entire authenticated exhibitor page on an entry-query error. Independently loaded show data remains visible; count-aware children receive null and render unavailable state.

Alternative: show a full-page error to authenticated visitors but not anonymous visitors. Rejected because authentication status does not change which independent facts are still trustworthy.

### 4. Accessibility repairs reuse each style's existing structure

The fixes add semantic attributes, heading corrections, focus-visible rules, and overflow containers inside existing components and scoped CSS. They do not introduce a shared navigation component or restyle the themes.

Alternative: replace all landing navigation and status components with a new design-system primitive. Rejected as unnecessary surface/architecture expansion for the enumerated defects.

## Risks / Trade-offs

- [Large TypeScript blast radius from nullable counts] → Change the central types first, use focused compile errors to enumerate consumers, and add explicit unavailable rendering tests before broad typecheck.
- [Style adapters accidentally lose a current presentation-only field] → Preserve each public hook's exported return type during migration and run its existing focused tests.
- [PR #1851 lands while overlapping work is in progress] → Rebase/merge current `main` before final verification and review the resulting diff specifically for stale-read/date regressions.
- [Shared hook becomes a monolith] → Keep pure derivation helpers separate from the React query wrapper and keep style-only mapping in existing adapters.
- [Fixed-light themes receive unsuitable generic focus colors] → Add scoped per-theme focus tokens/rules and test visibility semantics without changing the fixed-light INTENT.

## Migration Plan

1. Add shared types and pure derivation helpers with focused tests.
2. Migrate one style adapter at a time while keeping its component API stable.
3. Add missing awards/house-rules render points using existing sections rather than new pages or dialogs.
4. Introduce nullable count rendering in styled and default public paths.
5. Apply scoped accessibility/responsive repairs and regression tests.
6. Reconcile PR #1851, run focused suites, app typecheck/lint, and code review before PR creation.

Rollback is a normal source revert; there are no migrations, external API changes, or shared-system writes.
