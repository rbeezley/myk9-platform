# CLAUDE.md

Project guidance for Claude Code when working with myK9Q v3.

## Commands
```bash
npm run dev          # Vite dev server (port 5173)
npm run typecheck    # TypeScript check - run before commits
npm run lint         # ESLint
npm run build        # Production build
npm test             # Vitest tests
npm run test:e2e     # Playwright E2E tests
```

## Deployment Workflow

**Branches:**
- `develop` → deploys to **app.myk9q.com** (staging)
- `main` → deploys to **myk9q.com** (production)

**Default behavior:** Work on `develop` branch, push to staging for testing.

**Workflow:**
1. Make changes on `develop` branch
2. Push to `develop` → auto-deploys to app.myk9q.com (staging)
3. User tests on staging
4. When user says "deploy to production" or "push to main" → merge `develop` into `main`

**Edge Functions:** Supabase edge functions are shared (no branch separation). Deploy with:
```bash
npx supabase functions deploy <function-name>
```

## Tech Stack
- **React 19** + TypeScript (strict mode)
- **Vite 5** with PWA plugin
- **Zustand 5** for state management
- **Supabase** (PostgreSQL + real-time) - Project: `yyzgjyiqgmjzyhzkqdfx` (us-east-2)
- **React Query** for server state
- **Lucide React** icons
- **@dnd-kit** for drag-and-drop

## Architecture

### Offline-First Replication System
The app uses a custom offline-first architecture in `src/services/replication/`:
- **ReplicationManager** - Coordinates all replicated tables
- **ReplicatedTable** - Base class for offline-capable tables
- **SyncEngine** - Handles background sync to Supabase
- **MutationManager** - Queues mutations when offline

**Key pattern**: Always use replicated tables for data operations:
```typescript
import { replicatedClassesTable, replicatedEntriesTable } from '@/services/replication';
await replicatedClassesTable.updateClassStatus(classId, status);
```

### Three-Tier Pattern
1. **Stores** (Zustand): `entryStore`, `scoringStore`, `timerStore`
2. **Services**: Business logic and Supabase communication
3. **Components/Pages**: React UI with `@/` path alias

### Shared Dialog Pattern
Reusable dialogs in `src/components/dialogs/`:
- `ClassOptionsDialog` - Class action menu (Requirements, Settings, Status, Print)
- `ClassStatusDialog` - Status picker with time input
- `ClassRequirementsDialog`, `MaxTimeDialog`, `ClassSettingsDialog`

**Pattern**: Pass callbacks, dialog handles its own portal:
```typescript
<ClassOptionsDialog
  isOpen={isOpen}
  onClose={() => setOpen(false)}
  classData={classData}
  onStatus={() => openStatusDialog()}
  onRequirements={() => openRequirementsDialog()}
/>
```

## Development Principles
- **DRY**: Extract shared logic into reusable components/hooks/utilities - never duplicate code
- **Single Source of Truth**: One component per pattern (e.g., `ClassOptionsDialog` used everywhere, not inline copies)
- **Fix Tech Debt First**: When you find duplicated code, refactor it before adding new features
- **Type Safety**: No `any` types without explicit justification; run `npm run typecheck` before commits
- **Semantic Naming**: Clear, descriptive names for components, functions, and CSS classes

## Key Patterns

### Authentication
- Passcode-based: `[role][4 digits]` (e.g., `aa260`, `jf472`)
- Roles: admin (a), judge (j), steward (s), exhibitor (e)
- Use `usePermission()` hook for permission checks

### Database
- Always filter by `license_key` for multi-tenant isolation
- Core tables: `shows` → `trials` → `classes` → `entries` (scoring data included)
- Views: `view_class_summary`, `view_entry_with_results`
- Use Supabase MCP for live schema queries

### CSS
- Semantic class names (not utility-first)
- Design tokens via CSS variables (`--token-space-lg`, `--status-checked-in`)
- Mobile-first: base styles are mobile, enhance with `@media (min-width: 640px)`
- See `docs/CSS_ARCHITECTURE.md` for details

## File Structure
```
src/
  components/
    dialogs/          # Shared dialogs (ClassOptionsDialog, etc.)
    ui/               # UI primitives (Button, Badge, etc.)
  pages/
    ClassList/        # /trial/:id/classes
    EntryList/        # /class/:id/entries
    ShowDetails/      # Dashboard with ClassTable
    scoresheets/      # AKC/, UKC/, ASCA/ scoresheets
  services/
    replication/      # Offline-first sync system
  stores/             # Zustand stores
  hooks/              # Custom React hooks
```

## Common Tasks

### Adding a button to ClassOptionsDialog
1. Add callback prop to `ClassOptionsDialogProps`
2. Add button in the grid with appropriate icon
3. Wire up callback in all usages (ClassList, EntryList, ClassTable)

### Updating class status
```typescript
import { replicatedClassesTable } from '@/services/replication';
await replicatedClassesTable.updateClassStatus(classId, 'in_progress', {
  briefing_time: '10:30 AM'  // optional time fields
});
```

## Test Credentials
License key: `myK9Q1-a260f472-e0d76a33-4b6c264c`
- Admin: `aa260` | Judge: `jf472` | Steward: `se0d7` | Exhibitor: `e4b6c`

## Supabase

**Project ID**: `yyzgjyiqgmjzyhzkqdfx` | **Region**: us-east-2

### MCP Server (Preferred)
Use Supabase MCP tools for database operations:
- `mcp__supabase__execute_sql` - Run queries
- `mcp__supabase__apply_migration` - Apply DDL changes
- `mcp__supabase__list_tables` - View current schema
- `mcp__supabase__get_logs` - View logs (api, postgres, auth, edge-function)
- `mcp__supabase__get_advisors` - Security/performance checks

### Edge Functions
- `ask-myk9q` - AI chatbot for rules and show data
- `search-rules-v2` - Full-text search on competition rules
- `send-push-notification` - PWA push notifications
- `validate-passcode` - Authentication passcode validation

### CLI (when MCP doesn't support)
```bash
npx supabase db diff                    # Schema drift detection
npx supabase db pull                    # Pull remote schema
npx supabase secrets list               # List secrets
npx supabase secrets set KEY=value      # Set secret
```

## Reference Docs
- [DATABASE_REFERENCE.md](docs/DATABASE_REFERENCE.md) - Views, functions, triggers, query patterns
- [CSS_ARCHITECTURE.md](docs/CSS_ARCHITECTURE.md) - CSS patterns

### Quality
- Lint-clean code
- Unit tests for critical logic