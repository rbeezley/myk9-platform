# ADR-003: Zustand for State Management

## Status
Accepted

## Date
2026-01-02

## Context

The platform needed a client-side state management solution for domain state shared across components (scoring sessions, timers, UI selections, filters). Both apps had grown beyond what `useState` and React Context could cleanly handle for cross-component state.

Options considered:
- **Redux Toolkit** -- Mature but heavy; boilerplate-intensive for the scale of these apps
- **Jotai / Recoil** -- Atom-based; good for fine-grained reactivity but less natural for domain stores with related actions
- **React Context** -- Already used for auth/theme, but re-renders all consumers on any change; unsuitable for frequently-changing domain state
- **Zustand** -- Minimal API, no providers needed, built-in middleware for devtools/persistence, excellent TypeScript support, tiny bundle size (~1KB)

A key requirement was that the scoring domain (sessions, scores, timers) needed to be shared between myK9Q and myK9Show without duplicating store logic.

## Decision

We adopted **Zustand** as the primary client-side state management library, with a **dual middleware strategy** depending on the app context:

1. **myK9Q stores** use `devtools` + `persist` middleware -- Zustand handles local persistence directly (IndexedDB-backed scoring data persists through the Zustand `persist` middleware).

2. **myK9Show stores** use plain Zustand (no persistence middleware) -- data persistence is handled by `@myk9/replication`, which manages its own IndexedDB sync cycle.

3. **Shared stores** (`@myk9/scoring` package) expose a **factory pattern** so each app can configure middleware:
   ```typescript
   export function createScoringStore(enableDevtools = false) {
     return create<ScoringState>()(
       devtools(
         persist(
           (set) => ({ /* state + actions */ }),
           { name: 'scoring-store' }
         ),
         { enabled: enableDevtools }
       )
     );
   }
   export const useScoringStore = createScoringStore();
   ```
   This allows myK9Q to enable devtools in development while myK9Show can use the default instance.

State management responsibilities are clearly divided:

| Tool | Use Case |
|------|----------|
| Zustand | Client/UI state shared across components |
| React Query | Server state, async data fetching (myK9Show) |
| React Context | Cross-cutting concerns that rarely change (auth, theme) |
| `@myk9/replication` | Persistent data that must work offline (myK9Q) |
| Local `useState` | Ephemeral, component-scoped state |

## Consequences

### Positive
- Minimal boilerplate -- stores are plain functions with no providers, reducers, or action creators
- Selective re-rendering -- components subscribe to specific slices, avoiding the Context re-render problem
- Factory pattern enables shared scoring logic across both apps with different middleware configurations
- TypeScript inference works naturally -- store types are inferred from the implementation
- Tiny bundle impact (~1KB gzipped)

### Negative
- No built-in async middleware (unlike Redux Toolkit's `createAsyncThunk`) -- async actions are plain async functions in the store
- Devtools integration requires wrapping with `devtools()` middleware, which adds nesting
- Developers must know which state tool to use for which scenario (documented in CLAUDE.md anti-patterns)

### Neutral
- Store naming convention is `use<Domain>Store` (e.g., `useScoringStore`, `useTimerStore`, `useShowStore`)
- Stores live in `src/store/` (myK9Show) or `src/stores/` (myK9Q), and shared stores live in `packages/scoring/src/stores/`
