# ADR-001: Monorepo with pnpm and Turborepo

## Status
Accepted

## Date
2026-01-02

## Context

The myK9 platform consists of two web applications -- myK9Show (show management) and myK9Q (lightweight scoring) -- that were developed as separate repositories. As the platform matured, shared concerns emerged: both apps use the same Supabase backend, share domain types (dogs, classes, entries, scores), and duplicate logic for replication, scoring, and UI primitives.

Maintaining two repos meant:
- Duplicated type definitions that drifted out of sync
- No mechanism for sharing code without publishing to a registry
- Separate dependency trees with version skew
- Coordinating cross-repo changes required manual effort

We needed a monorepo tool that could handle workspace dependencies, parallel builds, and caching. The main contenders were:

- **npm workspaces** -- Native but slow installs, no content-addressable storage, poor hoisting behavior
- **yarn (Berry/v4)** -- Plug'n'Play adds complexity; PnP compatibility issues with some tooling
- **pnpm workspaces** -- Content-addressable store, strict dependency isolation, mature workspace protocol
- **Nx** -- Powerful but heavy; requires generators and plugins that add indirection
- **Turborepo** -- Lightweight task runner with remote caching, minimal config, pairs well with any package manager

## Decision

We adopted a **pnpm workspace monorepo orchestrated by Turborepo**.

**pnpm** was chosen as the package manager because:
- Content-addressable storage makes installs fast and disk-efficient (critical on Windows development machines)
- Strict node_modules structure prevents phantom dependencies
- The `workspace:*` protocol makes inter-package linking seamless
- Mature, well-documented, and the industry direction for monorepos

**Turborepo** was chosen as the build orchestrator because:
- Minimal configuration -- a single `turbo.json` defines the task graph
- Automatic dependency-ordered execution via `dependsOn: ["^build"]`
- Local caching avoids redundant rebuilds
- Pairs naturally with pnpm (now owned by the same company, Vercel)
- No framework lock-in -- works with Vite, tsup, or any build tool

The monorepo workspace is defined in `pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

All orchestration commands (`build`, `typecheck`, `lint`, `test`, `dev`) are delegated through Turborepo in the root `package.json`.

## Consequences

### Positive
- Single `pnpm install` sets up all apps and packages with linked workspace dependencies
- Shared packages (`@myk9/core`, `@myk9/replication`, `@myk9/scoring`, etc.) are imported like any other dependency
- Turborepo caching eliminates redundant builds -- unchanged packages are skipped
- Atomic commits can span both apps and shared packages, keeping everything in sync
- A single CI pipeline can build, lint, and test the entire platform

### Negative
- Developers must learn pnpm-specific behaviors (strict hoisting, `workspace:*` protocol)
- Turborepo adds a layer of indirection for task execution that can be confusing when debugging build order
- Large `node_modules` on first clone (mitigated by pnpm's content-addressable store)
- Windows-specific path issues occasionally require forward-slash workarounds in tooling

### Neutral
- The root `package.json` is pinned to `pnpm@9.15.9` via `packageManager` field, ensuring consistent installs across machines
- Turborepo's TUI mode (`"ui": "tui"`) provides interactive output during development
