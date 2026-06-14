# Show Map All Exhibitors Design

Date: 2026-06-11
Status: Approved for implementation planning

## Problem

Secretaries need a fast way to find a dog at the desk, see that dog's full day across classes and trials, and spot check-in or entry issues without leaving the Show Map. The current Show Map is trial-first, which is excellent for operating the show structure, but less direct when the secretary starts with a dog name, armband, or exhibitor question.

This should not become a second page or an isolated exhibitor-management surface. The project is in a consolidation phase, so the by-dog view must tighten the existing Show Map workflow instead of creating another place to manage entries.

## Duplication Decision

This adds a second lens onto the same Show Map data, but it does not duplicate an existing page. The justified scope is an inline tree grouping inside Show Map:

- Reuse the existing `trials`, `classes`, and `entries` inputs.
- Reuse the existing tree rendering, expansion, filters, status badges, attention counts, and row actions where applicable.
- Do not add new data fetching, a new page, or a new management workflow.
- Do not recreate Entry Management bulk editing or approval controls.

## Recommended Shape

Add a synthetic top-level **All Exhibitors** row above the existing trial rows.

The default Show Map remains calm:

- Root is still expanded by default.
- The **All Exhibitors** row is visible but collapsed.
- Trial rows remain visible below it.
- Class rows stay collapsed until the secretary expands a trial, preserving the existing `// INTENT:` behavior that avoids a wall of rows.

When expanded, **All Exhibitors** contains one row per dog in the show roster. Expanding a dog row shows that dog's class entries.

## Tree Structure

Current structure:

```text
show
  trial
    class
      entry
```

New structure:

```text
show
  all-exhibitors
    dog
      dog-entry
  trial
    class
      entry
```

The trial-first branch remains the operational map. The by-dog branch is a lookup and cross-check branch.

## Node Types

Extend `ShowMapNodeType` with:

- `all-exhibitors`
- `dog`
- `dog-entry`

`all-exhibitors` and `dog` are synthetic nodes. `dog-entry` represents the same underlying entry as an existing `entry` node, but with class/trial context emphasized in its label/subtitle.

Stable IDs:

- `all-exhibitors:${show.id}`
- `dog:${dogId}` when a dog ID exists
- `dog:unknown:${normalizedDogName}` when an entry has a dog name but no dog ID
- `dog-entry:${entryId}` when unique in the dog branch

If the same `entryId` appears in both branches, keep branch-specific node IDs to avoid collisions with the existing `entry:${entryId}` nodes.

## Dog Row Content

Dog rows should answer the desk question quickly:

- Primary label: armband plus dog call name when available, for example `#14 Bella`.
- Subtitle: handler name and breed when available.
- Count: number of class entries for that dog.
- Status badges: aggregate attention/check-in issues from that dog's entries.
- Progress: completed entries out of total entries using the existing progress style.

Sorting:

1. Numeric armband when available.
2. Dog call name.
3. Handler name.
4. Stable ID fallback.

This keeps the list familiar to secretaries who remember the old exhibitor list and makes armband lookup fast.

## Dog Entry Row Content

Dog-entry rows should show the dog's whole day without making the secretary mentally join data from multiple branches:

- Primary label: class name.
- Subtitle: trial name/date, ring, judge, and start time when available.
- Status badges: reuse entry run/check-in status and attention badges.
- Navigation/actions: use the same entry action rules where they make sense, but avoid adding dog-branch-only actions.

The dog-entry row may reuse the existing `EntryIdentity` presentation only if it can still foreground class/trial context. If not, add a small branch-aware renderer for `dog-entry` rows.

## Search And Filters

Add dog/armband matching to the existing Show Map filter behavior only if it stays scoped and predictable:

- Existing `all`, `in-progress`, and `needs-attention` filters continue to work.
- When filtering by attention, the **All Exhibitors** row should remain visible if any dog descendant matches.
- Dog rows should remain visible when any dog-entry descendant matches.

Do not add a separate Dogs mode in this slice. A global Show Map text search can be considered later, but the first implementation should keep scope to the tree branch and existing controls.

## Expansion Behavior

Default expansion:

- `getDefaultExpandedNodeIds(tree)` returns only the root ID, as it does today.
- This means **All Exhibitors** and trials are visible, but both dog rows and class rows are collapsed by default.

Expand trials:

- `getTrialsExpandedNodeIds(tree)` expands the root plus trial rows.
- It should not expand **All Exhibitors** by default.

Collapse all:

- Collapse back to root-only.

Keyboard behavior:

- `all-exhibitors`, `dog`, and `dog-entry` participate in the ARIA tree navigation.
- Arrow keys, Home/End, and Enter/Space row-action behavior should match the existing tree contract.

## Data Flow

Build the by-dog branch inside `buildShowMapTree`.

Use the already-provided inputs:

- `show`
- `trials`
- `classes`
- `entries`

Create lookup maps while building the existing trial tree:

- `classById`
- `trialById`
- `entriesByDogKey`

No direct Supabase reads, no RPCs, and no online-only data paths.

## Error And Empty States

If there are no entries with dog information:

- Keep the **All Exhibitors** row visible only if there are entries.
- If the row is present but has no usable dog names, dog rows should use plain fallback labels such as `Unknown dog`.

If a dog-entry cannot resolve its class or trial:

- Still show the dog-entry row.
- Use `Unknown class` or omit unavailable subtitle parts.
- Do not throw or hide the entry silently.

## Accessibility

The new branch must preserve the existing tree semantics:

- Correct `role="treeitem"` and `aria-level`.
- `aria-expanded` only on rows with visible children.
- `data-node-id` and `data-node-type` on all new row types for testing and browser probes.
- Touch targets remain at least 44px high.

The visible label should use dog-show language: **All Exhibitors**, dog names, armbands, handlers, classes, and trials. Avoid technical labels such as "pivot" or "grouping".

## Testing

Add focused unit coverage for `showMapTree`:

- Creates the `all-exhibitors` top-level row before trial rows.
- Groups entries by dog.
- Sorts dog rows by armband, then dog name.
- Shows dog-entry children with class/trial context.
- Rolls up dog attention counts and progress.
- Keeps default expansion root-only.
- Keeps `getTrialsExpandedNodeIds` trial-only.

Add focused rendering coverage for `ShowMapStructureTable`:

- Renders **All Exhibitors** as a collapsible top-level row.
- Expanding a dog row shows class/trial context for that dog.
- New node types have `data-node-id`, `data-node-type`, and ARIA tree attributes.
- Needs-attention filtering keeps matching dog ancestors visible.

Run:

```bash
cd apps/myk9show && npx vitest run src/features/show-map/__tests__/showMapTree.test.ts
cd apps/myk9show && npx vitest run src/features/show-map/__tests__/ShowMapStructureTable.test.tsx src/features/show-map/__tests__/ShowMapStructureTable.attrs.test.tsx
pnpm typecheck
```

If a broader suite hangs for more than 60 seconds, stop and report the hang instead of retrying in a loop.

## Out Of Scope

- A new Show Map page.
- A separate Dogs mode or segmented lens switch.
- Side-by-side dog index layout.
- New Supabase queries or schema changes.
- Entry Management bulk actions.
- Rebuilding deleted myK9Q surfaces.
- New dog/exhibitor CRUD controls.

## Implementation Notes

Keep the implementation small and branch-aware:

- Prefer extending the existing tree model over creating a parallel tree type.
- Keep synthetic node helpers near `showMapTree.ts`.
- Extract dog-branch helpers only if `showMapTree.ts` would become hard to scan or exceed the project file-size guidance.
- Preserve every existing `// INTENT:` comment and behavior around calm default expansion.
