# myK9 Platform

Monorepo for myK9 applications - dog show management and scoring tools.

## Applications

- **@myk9/show** - Full show management (shows, trials, classes, entries, dogs, people)
- **@myk9/q** - Lightweight mobile scoring app for judges and exhibitors

## Packages

- **@myk9/core** - Shared utilities, types, and constants
- **@myk9/replication** - Offline-first data sync system
- **@myk9/supabase** - Supabase client and generated types
- **@myk9/ui** - Shared UI components (Tailwind + Base UI)
- **@myk9/scoring** - Scoring logic and components

## Getting Started

```bash
# Install pnpm if you haven't
npm install -g pnpm

# Install dependencies
pnpm install

# Run myK9Show in development
pnpm dev:show

# Run myK9Q in development
pnpm dev:q

# Build all packages
pnpm build

# Run type checking
pnpm typecheck

# Run linting
pnpm lint
```

## Tech Stack

- **Build System:** Turborepo + pnpm workspaces
- **Frontend:** React 19, TypeScript, Vite
- **State:** Zustand
- **Database:** Supabase (PostgreSQL)
- **UI (myK9Show):** Tailwind CSS + Base UI via shadcn/ui
- **UI (myK9Q):** Semantic CSS (unchanged from production)

## Structure

```
myk9-platform/
├── apps/
│   ├── myk9show/     # Full show management app
│   └── myk9q/        # Lightweight scoring app
├── packages/
│   ├── core/         # Shared utilities and types
│   ├── replication/  # Offline-first sync system
│   ├── supabase/     # Supabase client
│   ├── ui/           # Shared UI components
│   └── scoring/      # Scoring logic
└── docs/             # Documentation
```
