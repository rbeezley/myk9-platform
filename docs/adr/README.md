# Architecture Decision Records

This directory contains the Architecture Decision Records (ADRs) for the myK9 Platform. ADRs document significant architectural choices, the context behind them, and their consequences.

## Index

| ADR                                      | Title                                                       | Status   | Date       |
| ---------------------------------------- | ----------------------------------------------------------- | -------- | ---------- |
| [001](001-monorepo-pnpm-turborepo.md)    | Monorepo with pnpm + Turborepo                              | Accepted | 2026-01-02 |
| [002](002-base-ui-over-radix.md)         | Base UI (via shadcn/ui) over Radix Primitives               | Accepted | 2026-01-02 |
| [003](003-zustand-state-management.md)   | Zustand for State Management                                | Accepted | 2026-01-02 |
| [004](004-offline-first-indexeddb.md)    | Offline-First Architecture with IndexedDB                   | Accepted | 2026-01-02 |
| [005](005-dual-ui-strategy.md)           | Dual UI Strategy (Tailwind/shadcn vs Semantic CSS)          | Accepted | 2026-01-02 |
| [006](006-package-boundaries.md)         | Package Boundaries and Dependency Graph                     | Accepted | 2026-01-02 |
| [007](007-supabase-backend.md)           | Supabase as Unified Backend                                 | Accepted | 2026-01-02 |
| [008](008-entity-module-export-shape.md) | Canonical Entity-Module Export Shape (Flat Named Functions) | Accepted | 2026-05-14 |

## Format

Each ADR follows a consistent structure:

- **Status** -- Accepted, Superseded, or Deprecated
- **Date** -- When the decision was made
- **Context** -- The problem and constraints that led to the decision
- **Decision** -- What was decided and why
- **Consequences** -- Positive, negative, and neutral outcomes
