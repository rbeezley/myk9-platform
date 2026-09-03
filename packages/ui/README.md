# @myk9/ui

Internal shared UI components, design tokens, and Tailwind preset for myK9Show.

## Public surface

- Primitives: Button, Badge, Card, Input, Sheet, and Tabs families.
- Domain components: StatCard, StatsGrid, StatusBadge, StatusIcon, ClassCard, and TabBar.
- Utilities: `cn` and `myk9Preset`.

See [the package barrel](src/index.ts) and [component exports](src/components/index.ts) for exact names and props. Existing consumers continue to use the package's stylesheet exports; component styles are built by `pnpm build`.

Unused shared Dialog, TimerDisplay, PageLayout, collapsible, and ClassCard WarningBanner implementations were removed. Existing app-local surfaces were not replaced. Shared Tabs remains in use by the app wrapper.

## Verification

Run from this package directory:

```sh
pnpm build
pnpm typecheck
pnpm test --run
```
