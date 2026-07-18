## Context

myK9Show already has view state, but it is surface-specific:

- `useEntryManagementFilters` uses normalized URL search parameters for attention, payment, work mode, view mode, trial, class, roster, and search state.
- Entry Management already has useful work modes and filters but requires the secretary to rediscover them.
- `ClassManagementPage` keeps search, status, and element filters locally and has its own display structure.
- The Show Workbench is the canonical place to orient a secretary to a show; it should link to a focused view rather than become a second management list.

The goal is to make recurring work recoverable without building a general-purpose saved-query product. The primary users are secretaries and stewards who need readable, show-scoped presets on desktop and tablet. The view layer must remain calm, explicit, and safe around bulk selection.

## Goals / Non-Goals

**Goals:**

- Use one typed representation for supported operational filters and display choices.
- Make curated presets obvious on existing Entry and Class Management surfaces.
- Preserve view state through normalized URLs where the surface already owns URL state.
- Allow a personal saved view on the current device without adding a database migration.
- Keep view changes reversible and non-mutating; view changes must not accidentally execute an action.
- Make view names plain and role-specific: “Needs check-in,” “Payment due,” “Today’s classes,” and similar.

**Non-Goals:**

- No universal view builder, arbitrary nested boolean filters, or user-authored formulas.
- No cross-show view that mixes records from unrelated show contexts.
- No server-synchronized shared views in this change.
- No view-specific duplicate data reads that bypass existing replication/query layers.

## Decisions

### 1. Use an explicit view definition, not ad hoc query-string assembly

Define a typed view model with a surface identifier, supported filter values, optional grouping/display settings, and a serialization version. Presets produce this model; each surface owns the adapter that applies it to its existing filter hook.

Entry Management continues to use `normalizeEntryManagementSearchParams` and `useSearchParams`. New preset helpers build parameters through the existing normalizer rather than callers concatenating strings. Class Management's search/status/element state becomes URL-backed in this change, through its own normalizer built on the same contract (`normalizeClassManagementSearchParams`, mirroring the Entry Management pattern). This is required, not optional: the acceptance gate includes copy-link handoff and refresh/back reliability on both surfaces, which local component state cannot satisfy.

Alternative considered: put all preset logic in one global router helper. Rejected because each surface has different valid filters and owner semantics.

### 2. Start with curated presets, then add personal local saves

The first visible view menu contains a short set of curated presets whose filters have a clear clearing destination:

- Entries: Needs review, Payment due, Needs check-in, All entries.
- Classes: Not started, In progress, Completed, All classes.
- Show Workbench links may open one of these existing views with show/trial/class context.

“Save this view” stores only a validated view definition in a local preference key namespaced by authenticated user and owning surface. The stored definition records its serialization version and show scope. Restore revalidates the current user, surface, show, trial, and class before applying state; invalid or cross-show definitions are removed or reset, and account changes clear in-memory saved-view state. It is device-local and labeled as personal. Shareability comes from the normalized URL, not from pretending a local preference is shared. Cross-device/shared views require a later user-settings/schema design.

**Relationship to the existing Quick View presets.** `class-entry-operational-visibility` requires that the existing Quick View presets and enrollment grouping not be replaced. In code these are Entry Management's `EntryWorkMode`/`ViewMode` switches (`useEntryManagementFilters`, `EntryWorkModeSwitch`). Curated presets *extend* this mechanism rather than coexist beside it: a preset is a named, typed combination of the same work-mode/view-mode/filter values, applied through the same normalizer, so there is exactly one preset system. No second preset menu, mode switch, or parallel filter store is added; if a curated preset and an existing work mode would express the same view, the work mode is the preset's definition.

Alternative considered: add a `saved_views` database table immediately. Rejected because it expands ownership, RLS, deletion, and sharing decisions before the recurring view vocabulary is proven.

### 3. Treat display presets as bounded layout choices

Display presets may choose a small allowlisted set of columns, grouping, and density values. They may not change the meaning of a status or hide required safety information. A secretary view may show payment and review columns; a show-day view may prioritize armband, dog, class, and check-in.

The app must always retain object identity, current status, selection controls, and the row action menu. Display choices are presentation preferences, not authorization or data filters.

### 4. Clear selection when a view changes

Applying a preset, changing a filter, or loading a saved view clears active selection through the shared selection controller from `inline-bulk-actions-and-editable-status`. This prevents a secretary from changing the view and accidentally applying a bulk operation to a previously selected set they can no longer see.

### 5. Keep views useful offline

Applying a view is local UI state and must work from already-loaded or replicated data. A view must not issue a new online-only query merely because it was saved or selected. If a preset depends on data that is not loaded, the surface shows its existing loading/partial state and never presents confident empty counts.

## Risks / Trade-offs

- **[Risk] URL parameters drift from the actual filters.** → Centralize serialization and add round-trip/invalid-value tests against each surface’s normalizer.
- **[Risk] Presets become a second navigation system.** → Keep presets inside the owning management page and link to them from the Workbench only when the destination contains the clearing action.
- **[Risk] A display preset hides information needed for safe work.** → Allowlist columns and keep identity, state, selection, and row actions mandatory.
- **[Risk] Local saved views appear shared or leak scope on a shared tablet.** → Namespace by authenticated user and surface, revalidate show scope on restore, clear in-memory state on account change, label views personal/device-only, and make shareable URLs the explicit collaboration path.
- **[Risk] View changes leave stale selection.** → Clear selection on every view identity change and test filter, preset, tab, and scope transitions.
- **[Trade-off] No cross-device custom views initially.** → Prefer a small complete feature with safe URL sharing over a premature settings schema.

## Migration Plan

1. Inventory the supported filter/display state for Entry Management and Class Management.
2. Add the typed view model, preset definitions, URL helpers, and local preference adapter.
3. Add curated Entry Management presets using the existing URL-normalization path.
4. Add Class Management presets and migrate its local filter state only as far as the current page can safely support.
5. Add personal save/reapply and display presets with selection clearing.
6. Add Show Workbench deep links to the existing owner surfaces, then verify refresh, back navigation, offline/cached data, and tablet readability.

Rollback removes preset entry points and local preference reads; existing filters and URLs continue to work. No data migration or status mutation is involved.

### 6. Copy-link is the sharing mechanism

Both Entry Management and Class Management view headers get a copy-link affordance that copies the current normalized URL. The copied URL MUST round-trip through the surface's normalizer (paste → same view). This is the only sharing path in this slice; personal saved views stay device-local and are labeled "Saved views (this device)" so the scope is unambiguous.

## Resolved Questions

- Class Management URL state: introduced in this change (see Decision 1) — required by the copy-link and refresh acceptance criteria.
- Naming: "Saved views (this device)" — plain-language device scope beats "My presets."

## Open Questions

- Which four or five curated presets are most useful to secretaries in the first browser walk? (Confirm during browser verification; start with the Decision 2 set.)
