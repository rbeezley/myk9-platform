## Context

Entry detail on Entry Management is presented today by `EntryEditDialog` (`components/entries/EntryEditDialog.tsx`), a centered modal. Relevant current state:

- `EntryEditDialog` is rendered from **two** surfaces: the secretary `EntryManagementPage` (`pages/secretary/EntryManagementPage.tsx`) and the exhibitor `MyEntriesPage` (`pages/MyEntriesPage/modules/MyEntriesDialogs.tsx`). These are different contexts — a secretary processing an operational queue vs. an exhibitor editing their own small set of entries.
- Entry Management already owns normalized URL state through `normalizeEntryManagementSearchParams` (`components/entries/management/entryManagementFilters.ts`), which manages params like `tab`, `queue`, `attention`, `trial`, `class`, `payment`, `mode`, and `view`. Adding an `entry` param fits the existing pattern.
- A `Sheet` primitive already exists at `components/ui/sheet.tsx`; the pane should build on it rather than introduce a new overlay primitive.
- The shared entry action definitions and inline status editing come from `inline-bulk-actions-and-editable-status` (MYK9-47); the pane must consume those, not re-implement mutations.

The goal is to make the secretary's open → act → next loop keep its place in the list, on desktop and tablet, without adding a page or route.

## Goals / Non-Goals

**Goals:**

- Present entry detail as a side pane over Entry Management so the list, filters, scroll position, and bulk selection stay visible and intact.
- Make the open entry URL-addressable (`?entry=<id>`) through the existing normalizer so refresh, back/forward, and copied links restore it within show scope.
- Provide previous/next that walks the current filtered, ordered result set without closing the pane.
- Reuse MYK9-47 shared actions and inline status editing inside the pane.
- Use one component that renders as a right-side pane on desktop and full-width on tablet/narrow viewports.
- Retire `EntryEditDialog` on Entry Management, leaving a single entry-detail path there.

**Non-Goals:**

- No new route or standalone entry-detail page.
- No change to entry mutation semantics, offline/replication paths, role checks, or transition rules.
- No rollout of the peek pattern to other entities or surfaces in this slice.
- No redesign of the entry-detail form's fields or contents beyond re-housing them in the pane.

## Decisions

### 1. Build on the existing `Sheet`, not a new overlay

The pane is a right-anchored `Sheet` on desktop (list stays visible and interactive to the left) and a full-width `Sheet` on tablet/narrow viewports. One component switches anchor/size by breakpoint — never two CSS-hidden copies (avoids the responsive two-copy antipattern). Reusing `components/ui/sheet.tsx` keeps focus-trap, escape handling, and overlay semantics consistent with the rest of the app.

Alternative considered: a bespoke resizable split-pane. Rejected for this slice — heavier, and the `Sheet` already delivers the context-preserving behavior. A resizable split can be a later enhancement if secretaries ask for side-by-side.

### 2. Open state lives in the URL via the existing normalizer

Add a single `entry` param handled by `normalizeEntryManagementSearchParams`. The pane opens when `entry` is a valid id within the current show/filter scope and closes when it is absent. This makes refresh, back/forward, and copied links restore the peeked entry for free, and it is the same mechanism `operational-views-and-display-presets` (MYK9-48) uses — so the pane's open state and the view's filter state share one URL contract rather than competing.

Invalid or out-of-scope `entry` values are normalized away (pane stays closed), consistent with how the normalizer already drops invalid filter values. Never surface a cross-show entry through this param.

### 3. Previous/next walks the current result set, not the whole show

Prev/next operate over the entry ids in the surface's *current filtered and ordered* result set — the same list the secretary sees behind the pane. Reaching the ends disables the respective control rather than wrapping. Because the source of truth is the already-loaded/replicated list, prev/next needs no new query and works offline. If the current entry is filtered out by a concurrent data change, the pane shows its normal not-found/closed state rather than jumping to an unrelated entry.

### 4. Actions come from the MYK9-47 shared contract

The pane renders the shared entry action definitions and inline status editing rather than owning mutation logic. This keeps one permission-check and one offline/replication path across row menu, bulk menu, and pane. If MYK9-47 has not landed when this is implemented, the pane wraps the current per-entry actions behind the same interface so the swap is mechanical later — but it must not fork a second mutation path.

### 5. Scope removal of `EntryEditDialog` to Entry Management; keep it for MyEntries this slice

`EntryEditDialog` has two callers. This slice replaces it on Entry Management (the queue-processing surface where context-loss hurts). The exhibitor `MyEntriesPage` is a different journey and is **out of scope** here; it continues to use `EntryEditDialog`. Therefore the dialog component is **not deleted** in this slice — only its Entry Management call site is removed. Fully retiring the component requires a separate decision about the exhibitor surface, tracked as follow-up. This is called out explicitly so implementation does not delete a component the exhibitor path still depends on.

### 6. Focus management

On open, focus moves into the pane (first meaningful control). Focus is trapped while open (inherited from `Sheet`). On close or Escape, focus returns to the originating row so keyboard users keep their place in the queue. Prev/next moves pane content without dropping focus out of the pane.

## Risks / Trade-offs

- **[Risk] Deleting `EntryEditDialog` breaks the exhibitor MyEntries surface.** → Do not delete the component this slice; remove only the Entry Management call site (Decision 5). Grep both callers before any deletion.
- **[Risk] `entry` URL param drifts from actual open state or leaks cross-show.** → Route it through the existing normalizer, validate against show scope, and add round-trip/invalid-value tests alongside the existing normalizer tests.
- **[Risk] Prev/next disagrees with the visible order.** → Derive prev/next strictly from the surface's current ordered result set, not a re-fetch; test that it matches list order under active filters.
- **[Risk] Pane forks a second mutation path if MYK9-47 is not yet merged.** → Wrap current actions behind the shared interface; never add a parallel offline/replication write.
- **[Risk] Tablet renders a second hidden copy for layout.** → One `Sheet`, breakpoint-driven anchor/size; assert a single detail node in tests.
- **[Trade-off] Sheet over split-pane means no simultaneous side-by-side editing of two entries.** → Acceptable for the queue loop; revisit only on demonstrated need.
