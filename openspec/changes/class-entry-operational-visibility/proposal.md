## Why

Secretaries can already manage entries, inspect a class, and operate the show from canonical surfaces, but class readiness is not summarized where they inspect a class and the existing attention signals do not yet provide one shared, actionable routing contract. For fall 2026 launch readiness, the platform should answer “what needs attention in this class, and where do I fix it?” without making the secretary reconcile counts across Class Details, Entry Management, and Show Map.

Entry lifecycle changes are also recorded in several forms but are not presented as one trustworthy staff history. A scoped lifecycle history will improve show-day accountability without adding a new management page.

## What Changes

- Define typed, canonical entry- and class-attention reasons with count and deep-link behavior shared by Class Details, Entry Management, Show Map, and secretary dashboard consumers.
- Add a compact class readiness strip to the existing Class Details surface. Metrics use shared classifiers and link to the existing surface that can clear the condition.
- Add a read-only entry lifecycle history to the existing staff entry-detail workflow, using authoritative status-history fields and clear actor/time/reason presentation.
- Add count-to-filter agreement tests and a secretary browser walk so summary values cannot silently diverge from their destinations.
- Preserve Entry Management as the owner of broad entry work, Show Map as the owner of ordering, Show Desk as the owner of show-day operations, and the dedicated scoring routes as the owner of result entry.
- Do not add a class command center, another entry-management page, a generic Kanban board, manual project-style health updates, or a general-purpose comments system.
- Do not replace the existing Quick View presets or enrollment grouping. Verify those existing behaviors during implementation and open follow-up work only for a demonstrated gap.

## Capabilities

### New Capabilities

- `entry-attention-routing`: Typed attention reasons, shared count semantics, and exact links into the canonical clearing surface.
- `class-operational-readiness`: A compact, derived readiness summary on Class Details with metrics that agree with their filtered destinations.
- `entry-lifecycle-history`: A staff-visible, read-only lifecycle timeline backed by authoritative entry status history.

### Modified Capabilities

None.

## Impact

- Affects myK9Show class details, entry-management filters/deep links, show-map attention derivation, entry status-history reads/mapping, and focused tests for those areas.
- May require a narrowly scoped replication-backed or authorized read adapter for status history; implementation must not introduce a direct PostgREST read into a core offline-required flow without an explicit design decision.
- No new route or standalone page is justified. Class Details provides the overview, while all clearing actions remain on their existing owner surfaces.
- No external API contract is intentionally broken.
