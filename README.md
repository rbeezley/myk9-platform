# myK9 Platform

A monorepo for dog show management and ringside scoring.

## What is myK9 Platform?

myK9 Platform is a dog show management system built for exhibitors, judges, stewards, and club
administrators. It handles the full lifecycle of competitive dog events -- from show creation and
entry management through ringside scoring and results reporting.

The platform consists of two applications that share a unified Supabase backend:

- **myK9Show** -- Full show management: create shows, manage entries, assign judges, process
  payments, track results. Designed for desktop and tablet use by trial secretaries, club admins,
  and exhibitors.
- **myK9Q** -- Lightweight ringside scoring optimized for tablet use at venues with unreliable
  connectivity. Used by judges and stewards during live competition.

The key differentiator is an offline-first architecture. myK9Q stores all scoring data locally in
IndexedDB and syncs to the server when connectivity is available. This ensures judges can score
entries without interruption, even when venue Wi-Fi drops out.

myK9 Platform supports AKC, UKC, and ASCA competitions.

## Domain Model

For developers unfamiliar with competitive dog shows, here is the data hierarchy:

```
Show (competition event, e.g., "Bluegrass Classic 2026")
  └── Trial (single day or session within a show)
       └── Class (specific competition, e.g., "Novice Interior")
            └── Entry (one dog competing in that class)
                 └── Score (judge's evaluation: time, faults, pass/fail)
```

- **Shows** are organized by **clubs** -- the organizations that host them.
- Each show has a `license_key` that isolates its data from other shows.
- **Exhibitors** register dogs and enter them in classes. Each entry receives an **armband number**
  that identifies the dog/handler pair throughout the show.

## User Personas

| Role            | Primary App | What They Do                                       |
| --------------- | ----------- | -------------------------------------------------- |
| Exhibitor       | myK9Show    | Register dogs, enter shows, view results           |
| Judge           | myK9Q       | Score entries, manage timers, record faults        |
| Steward         | myK9Q       | Manage ring flow, call entries, assist judge       |
| Trial Secretary | myK9Show    | Process entries, assign armbands, handle waitlists |
| Club Admin      | myK9Show    | Create shows, assign judges, configure fees        |
| Platform Admin  | myK9Show    | System-wide analytics, club payouts                |

## Quick Start

### Prerequisites

- Node.js >= 20
- pnpm (`npm install -g pnpm`)

### Setup

```bash
git clone <repo-url>
cd myk9-platform
pnpm install
```

### Configure environment

```bash
# For myK9Show
cp apps/myk9show/.env.example apps/myk9show/.env

# For myK9Q
cp apps/myk9q/.env.example apps/myk9q/.env
```

Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in each `.env` file. You can find these
values in the Supabase dashboard under Settings > API.

### Run

```bash
pnpm dev:show   # myK9Show at localhost:5173
pnpm dev:q      # myK9Q dev server
```

## Project Structure

```
myk9-platform/
├── apps/
│   ├── myk9show/               # @myk9/show — Full show management (React + Tailwind)
│   │   └── supabase/functions/  # Edge Functions (stripe, email, cron)
│   └── myk9q/                  # @myk9/q — Ringside scoring (React + Semantic CSS)
│       └── supabase/functions/  # Edge Functions (rules, push, passcode)
├── packages/
│   ├── core/                   # @myk9/core — Utilities, types, constants
│   ├── replication/            # @myk9/replication — Offline-first IndexedDB sync
│   ├── supabase/               # @myk9/supabase — Client and generated DB types
│   ├── ui/                     # @myk9/ui — Shared UI components (Base UI + Tailwind)
│   ├── scoring/                # @myk9/scoring — Scoring logic and Zustand stores
│   ├── scoring-ui/             # @myk9/scoring-ui — Shared scoring UI hooks
│   └── test-utils/             # @myk9/test-utils — Testing utilities
├── supabase/
│   ├── migrations/             # Database migrations (001–025)
│   └── config.toml             # Supabase CLI config
├── docs/                       # Architecture decisions, schema docs, plans
├── turbo.json                  # Turborepo configuration
└── CLAUDE.md                   # AI-assisted development guidance
```

Edge Functions live inside each app directory (`apps/myk9show/supabase/functions/` and
`apps/myk9q/supabase/functions/`), not in the root `supabase/` folder. The root `supabase/`
directory contains only database migrations and CLI configuration.

## Tech Stack

| Category            | Choice                       | Notes                                                  |
| ------------------- | ---------------------------- | ------------------------------------------------------ |
| Package Manager     | pnpm                         | Workspaces for monorepo                                |
| Build Orchestration | Turborepo                    | Remote caching, parallel builds                        |
| Frontend            | React 19 + TypeScript + Vite | Strict TypeScript mode                                 |
| State Management    | Zustand + React Query        | Zustand for client state, React Query for server state |
| Database            | Supabase (PostgreSQL)        | Unified project, RLS enforced                          |
| UI (myK9Show)       | Tailwind CSS + Base UI       | via shadcn/ui                                          |
| UI (myK9Q)          | Semantic CSS                 | Unchanged from production                              |
| Hosting             | Vercel                       | Auto-deploy from main                                  |
| Payments            | Stripe                       | Via Supabase Edge Functions                            |
| Formatting          | Prettier                     | Auto-format on every edit                              |

## Development Workflow

### Commands

```bash
pnpm install          # Install all dependencies
pnpm dev:show         # Run myK9Show dev server
pnpm dev:q            # Run myK9Q dev server
pnpm build            # Build all packages and apps
pnpm typecheck        # TypeScript check across monorepo
pnpm lint             # ESLint across monorepo
pnpm clean            # Clean all build artifacts
```

### Testing

Tests run from app directories:

```bash
cd apps/myk9show && pnpm test        # Unit tests (vitest)
cd apps/myk9q && pnpm test           # Unit tests (vitest)
cd apps/myk9show && pnpm test:e2e    # E2E tests (playwright)
cd apps/myk9q && pnpm test:e2e       # E2E tests (playwright)
```

### Code quality

- **Pre-commit hooks** run `typecheck` and `lint` automatically before every commit.
- **Prettier** auto-formats files on save.
- **ESLint** is strict in myK9Show (no `any` allowed) and standard in myK9Q.
- **CI** via GitHub Actions runs quality checks, tests, and builds on every push.

## Deployment

| App      | Staging URL                       | Deploy Trigger |
| -------- | --------------------------------- | -------------- |
| myK9Show | myk9-platform-myk9show.vercel.app | Push to `main` |
| myK9Q    | myk9-platform-myk9q.vercel.app    | Push to `main` |

Edge Functions deploy separately via Supabase CLI:

```bash
supabase functions deploy <function-name> --no-verify-jwt
```

Functions handle authentication internally, so `--no-verify-jwt` is required.

Legacy production: [myk9q.com](https://myk9q.com) runs from a separate repository and is not part
of this monorepo.

## Architecture at a Glance

```
myK9Show ──┐                 ┌── Vercel (hosting)
            ├── @myk9/* ─── Supabase (DB + auth + Edge Functions)
myK9Q ─────┘                 └── Stripe (payments)
```

- **myK9Show** uses React Query for server state and Zustand for client state.
- **myK9Q** uses Zustand stores with `@myk9/replication` for offline-first data persistence.
- Both apps import shared logic from `@myk9/core`, `@myk9/scoring`, and `@myk9/replication`.
- See the [Architecture Decision Records](docs/adr/) for rationale behind key technical choices.

## Documentation

| Document                                      | Description                                 |
| --------------------------------------------- | ------------------------------------------- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md)       | System design, data flows, package graph    |
| [API.md](docs/API.md)                         | Edge Function API reference (12 functions)  |
| [ADRs](docs/adr/)                             | Architecture Decision Records (7 decisions) |
| [PRD.md](docs/PRD.md)                         | Product Requirements Document               |
| [SCHEMA-ANALYSIS.md](docs/SCHEMA-ANALYSIS.md) | Database schema documentation               |
| [MIGRATION-PLAN.md](docs/MIGRATION-PLAN.md)   | Monorepo migration plan and status          |
| [VERCEL-SETUP.md](docs/VERCEL-SETUP.md)       | Deployment configuration                    |
| [CLAUDE.md](CLAUDE.md)                        | AI-assisted development guidance            |
| [myK9Q docs](apps/myk9q/docs/)                | App-specific architecture and patterns      |

## Troubleshooting

**`pnpm: command not found`**
Install pnpm globally with `npm install -g pnpm`.

**Node version error**
This project requires Node >= 20. Check your version with `node --version`.

**Missing environment variables**
Copy the `.env.example` files in each app directory and fill in your Supabase credentials. See the
[Quick Start](#quick-start) section above.

**Supabase connection error**
Verify that `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in your `.env` files match the values
in your Supabase dashboard under Settings > API.

**Build failures**
Run `pnpm clean && pnpm install` to reset all build artifacts and reinstall dependencies.

**Type errors in packages**
Run `pnpm build` first. Shared packages must be built before apps can typecheck against them.

## Contributing

- Always use TypeScript, never JavaScript.
- Use pnpm (not npm or yarn).
- `pnpm typecheck` must pass before committing (enforced by pre-commit hook).
- Follow existing patterns in the codebase. See [CLAUDE.md](CLAUDE.md) for conventions.
- Keep files under 500 lines. Extract types and helpers into sibling modules when files grow large.
- Read the [Architecture Decision Records](docs/adr/) for context on key technical decisions.
