# Admin Help — Navigation Flow Diagram (v2)

**Date:** 2026-05-02
**Status:** Approved — ready for implementation planning
**Depends on:** Admin Help Page Directory v1 (live at `/admin/help`)

---

## Overview

Add a "Flow" view to the Admin Help Page Directory that renders a Mermaid.js navigation flow diagram. The diagram shows how pages connect (nav links, CTAs, tabs/child routes) so a site admin can understand not just what pages exist but how to get from A to B.

The existing role filter dropdown scopes the diagram — selecting a role reduces the graph to that role's pages and the edges between them. "All" shows the full topology.

---

## Data Layer

### `PageEntry` extension

Add `linksTo?: string[]` to the `PageEntry` interface in `features/admin-help/types.ts`:

```typescript
export interface PageEntry {
  path: string;
  title: string;
  description: string;
  roles: UserRole[];
  classification: 'critical-path' | 'park' | 'hidden';
  category: string;
  status: 'working' | 'stub' | 'known-issues';
  linksTo?: string[]; // paths this page navigates to (deep-link level)
}
```

### Edge population

Populate `linksTo` for all 63 entries in `data/pageDirectory.ts`. Edges cover three levels:

- **Nav links** — sidebar destinations reachable from this page
- **CTA links** — primary action buttons that navigate (e.g. "View entries" → `/entries/:id`)
- **Tab/child links** — tabs or drill-down routes this page hosts

Seed from `docs/navigation-ia.md` for the nav skeleton; fill deep-link edges by reading the component files for each page. Target: ~4 edges per page on average (~250 total declarations).

### Registry integrity constraint

Extend `pageDirectory.test.ts` with a test that asserts every path in every `linksTo` array resolves to an existing `PageEntry.path`. This fires at commit time and prevents orphaned edges from accumulating silently.

---

## Component Architecture

### `ViewToggle` — add `'flow'` icon

Extend `iconMap` in `components/common/ViewToggle.tsx` with:

```typescript
flow: Network,  // lucide-react Network icon
```

No other changes to `ViewToggle` — it already accepts arbitrary `{ key, label, icon }[]` modes generically.

### New `PageFlowDiagram.tsx`

Location: `features/admin-help/components/PageFlowDiagram.tsx`

**Props:**

```typescript
interface PageFlowDiagramProps {
  pages: PageEntry[]; // pre-filtered by AdminHelpPage's existing dropdowns
}
```

**Responsibilities:**

1. Call `buildMermaidGraph(pages)` to produce the graph string
2. Initialize Mermaid (once) with dark theme
3. Register the global click-navigation callback
4. Call `mermaid.render()` in a `useEffect` and inject the returned SVG
5. Show a `<Loader2>` spinner while rendering
6. Show an empty-state message when `pages` is empty: "No pages match the current filters."

**Edge scoping rule:** an edge is included only when both the source and target paths appear in `pages`. This means the role filter automatically scopes the graph — no stubs, no orphaned arrows pointing off-screen.

### Pure helper: `buildMermaidGraph`

Location: `features/admin-help/utils/buildMermaidGraph.ts`

Exported pure function — no React, no side effects, fully unit-testable.

```typescript
export function buildMermaidGraph(pages: PageEntry[]): string;
```

**Output format:**

```
flowchart LR
  admin_users["Users<br/>/admin/users"]
  admin_user_detail["User Detail<br/>/admin/users/:id"]
  admin_users --> admin_user_detail
```

Node IDs: path string with `/` and `:` replaced by `_`, leading `_` stripped.
Node labels: `"title<br/>path"` — requires `htmlLabels: true` in Mermaid config (set above). Title on line 1, path on line 2.
Click directives appended per node: `click admin_users "__myk9FlowNav" "/admin/users"`.

### `AdminHelpPage.tsx` changes

1. Add `useViewPreference('admin-help', 'list')` — persists active view to localStorage
2. Add `ViewToggle` in the page header top-right with modes:
   ```typescript
   [
     { key: 'list', label: 'List', icon: 'list' },
     { key: 'flow', label: 'Flow', icon: 'flow' },
   ];
   ```
3. Existing filter dropdowns, search bar, and checkboxes remain unchanged — they produce `filteredPages` which flows unchanged to both renderers
4. Render `<PageFlowDiagram pages={filteredPages} />` when `viewMode === 'flow'`; render existing accordion sections when `viewMode === 'list'`

---

## Mermaid Integration

**Package:** `mermaid` (runtime dep, not devDep — renders in browser).

**Initialization** (once per component mount):

```typescript
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  flowchart: { curve: 'basis', useMaxWidth: true, htmlLabels: true },
});
```

**Rendering:**

```typescript
useEffect(() => {
  const id = `myk9-flow-${Date.now()}`;
  const { svg } = await mermaid.render(id, buildMermaidGraph(pages));
  containerRef.current.innerHTML = svg;
}, [pages]);
```

A new unique ID per render avoids Mermaid's internal cache collisions on filter changes.

**Click-to-navigate:**

```typescript
// Registered once before mermaid.render():
(window as any).__myk9FlowNav = (path: string) => navigate(path);
```

Each node's click directive passes the page path as the callback argument. Mermaid calls the registered function on node click.

---

## Tests

### `buildMermaidGraph.test.ts` (new)

| Test                         | Assertion                              |
| ---------------------------- | -------------------------------------- |
| Two pages with a shared edge | String contains `nodeA --> nodeB`      |
| Edge target not in `pages`   | Edge omitted from output               |
| Path sanitization            | `/admin/users/:id` → `admin_users__id` |
| Empty `pages`                | Returns empty string (no crash)        |
| Cyclic edges (A → B → A)     | Renders without throwing               |

### `pageDirectory.test.ts` (extend)

| Test                        | Assertion                                          |
| --------------------------- | -------------------------------------------------- |
| Every `linksTo` path exists | All referenced paths resolve to a `PageEntry.path` |

### `PageFlowDiagram.test.tsx` (new)

| Test          | Assertion                                                  |
| ------------- | ---------------------------------------------------------- |
| Loading state | `<Loader2>` visible before Mermaid resolves                |
| Empty state   | "No pages match" message when `pages = []`                 |
| Render call   | `mermaid.render` called with correct graph string (mocked) |
| Click handler | `useNavigate` called with correct path on node click       |

### `AdminHelpPage.test.tsx` (extend)

| Test                       | Assertion                                              |
| -------------------------- | ------------------------------------------------------ |
| ViewToggle present         | Both `list` and `flow` modes rendered                  |
| Flow mode mounts diagram   | `PageFlowDiagram` mounts when flow selected            |
| List mode unmounts diagram | `PageFlowDiagram` unmounts when list selected          |
| Persistence                | `useViewPreference` stores active view in localStorage |

---

## Files Changed

| File                                                      | Change                                  |
| --------------------------------------------------------- | --------------------------------------- |
| `features/admin-help/types.ts`                            | Add `linksTo?: string[]` to `PageEntry` |
| `features/admin-help/data/pageDirectory.ts`               | Populate `linksTo` for all 63 entries   |
| `features/admin-help/utils/buildMermaidGraph.ts`          | New — pure graph string generator       |
| `features/admin-help/components/PageFlowDiagram.tsx`      | New — Mermaid render component          |
| `features/admin-help/components/AdminHelpPage.tsx`        | Add ViewToggle + Flow mode rendering    |
| `components/common/ViewToggle.tsx`                        | Add `flow: Network` to iconMap          |
| `features/admin-help/index.ts`                            | Export `PageFlowDiagram`                |
| `apps/myk9show/package.json`                              | Add `mermaid` runtime dep               |
| `features/admin-help/__tests__/buildMermaidGraph.test.ts` | New tests (5)                           |
| `features/admin-help/__tests__/PageFlowDiagram.test.tsx`  | New tests (4)                           |
| `features/admin-help/__tests__/AdminHelpPage.test.tsx`    | Extend (4 new tests)                    |
| `features/admin-help/__tests__/pageDirectory.test.ts`     | Extend (1 new test)                     |

---

## Out of Scope

- Pan/zoom controls (Mermaid's `useMaxWidth` handles responsive scaling; interactive zoom deferred to post-Phase-3)
- Cross-role edge visibility in "all" filter mode beyond what Mermaid auto-layouts (no swim lanes)
- Surfacing Flow view to non-admin roles (admin-only for now, per v1 spec)
