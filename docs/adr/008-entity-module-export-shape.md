# ADR-008: Canonical Entity-Module Export Shape (Flat Named Functions)

## Status

Accepted

## Date

2026-05-14

## Context

`CONTEXT.md` mandates that each domain entity has one authoritative data-access module under `apps/myk9show/src/services/database/<entity>/`, and that callers import only from that module's `index.ts`. The rule fixes the _location_ of the seam but not its _shape_.

In practice two shapes had grown side-by-side:

- **Shape Y -- Object export.** A single `entityQueries` object with methods (`achievementQueries.create(...)`, `achievementQueries.getById(...)`). Used by older modules including `achievements/`.
- **Shape X -- Flat named exports.** Per-operation functions (`logActivity`, `getActivityForRecord`, `createAchievement`). Used by newer modules including `activity-logs/`, `entries/`.

Both work. But mixing them across ~13 entity modules creates two costs:

1. **Cognitive friction.** A caller of `achievements` reaches for `achievementQueries.create(data)`; a caller of `activity-logs` reaches for `logActivity(entry)`. The pattern is not learnable from the call site -- the reader has to remember which module is which.
2. **Re-litigation.** Each new entity module triggers the same micro-debate. Architecture passes (e.g. the `improve-codebase-architecture` skill) re-suggest normalization in both directions until a convention is recorded.

The migration of `achievements/` to Shape X (2026-05-14) forced the choice; recording it now prevents drift back to Shape Y.

## Decision

**All entity-module data-access exports use Shape X: flat named functions.**

```typescript
// services/database/achievements/reads.ts
export async function createAchievement(data: CreateAchievementData): Promise<Achievement> { ... }
export async function getAchievementById(id: string): Promise<Achievement | null> { ... }
export async function getAchievementsByDogId(dogId: string): Promise<Achievement[]> { ... }
export async function updateAchievement(data: UpdateAchievementData): Promise<Achievement> { ... }
export async function deleteAchievement(id: string): Promise<void> { ... }

// services/database/achievements/index.ts
export {
  createAchievement,
  getAchievementById,
  getAchievementsByDogId,
  updateAchievement,
  deleteAchievement,
} from './reads';
```

**Naming rules:**

- Function names are **entity-descriptive**, not bare verbs. Use `createAchievement`, not `create`.
- Plurality reflects return shape: `getAchievementById` (one) vs `getAchievementsByDogId` (many).
- Reserved words (`delete`, `new`, `class`) are dodged by the entity-prefix convention.

**Internal organization within an entity module is unconstrained.** A module may split implementation across `reads.ts`, `writes.ts`, `lifecycle.ts`, `secretary.ts`, etc. Only the `index.ts` surface is governed.

## Reasons

- **`delete` is a JavaScript reserved word.** Bare `export function delete(id)` is invalid; an aliased import (`import { delete as remove } from ...`) shifts complexity to every caller. Entity-prefixed names sidestep the problem entirely.
- **Multi-entity callers collide on bare verbs.** A hook that imports from both `achievements/` and `dogs/` cannot do `import { create } from '@/services/database/achievements'; import { create } from '@/services/database/dogs'` without aliasing. Descriptive names compose.
- **Smaller per-call-site interface.** A caller that needs only `getActivityForRecord` imports only that. Shape Y forces import of the whole `activityQueries` object even when one method is used -- a worse signal for the deletion test (the import says "I might use anything" instead of "I use this one thing").
- **Test surface is intent-revealing.** `expect(createAchievement).toHaveBeenCalledWith({ ... })` reads as a domain operation; `expect(achievementQueries.create).toHaveBeenCalledWith({ ... })` reads as an API call to a generic bag.
- **Tree-shaking.** Bundlers eliminate unused flat exports more reliably than unused methods on an exported object.

## Consequences

### Positive

- One shape across all entity modules; new contributors learn it once.
- Architecture passes stop re-suggesting export-shape normalization.
- Reserved-word and collision problems are structurally avoided.
- Call sites read as intent: `createAchievement(data)` over `achievementQueries.create(data)`.

### Negative

- Existing Shape Y modules require migration when touched -- a one-time cost per module.
- Each entity-prefixed name is longer than the bare-verb equivalent, so call sites grow by a few characters.
- `index.ts` re-export lists are longer than `export { entityQueries } from './reads'`.

### Neutral

- The rule constrains only the surface at `<entity>/index.ts`. Internal helpers, mappers, and validators (e.g. `achievementMappers`) are unaffected and may keep object exports if that fits their role.
- Migration is incremental. Modules are converted to Shape X when the surrounding code is touched for another reason; no big-bang refactor is required.
- The convention applies to `apps/myk9show/src/services/database/<entity>/`. It does not govern `services/replication/`, `services/collaboration/`, or other non-entity layers.

## Migration record

- 2026-05-14: `services/database/activity-logs/` -- already Shape X, no change.
- 2026-05-14: `services/database/achievements/` -- migrated from Shape Y to Shape X. Updated 7 call sites in `hooks/queries/useAchievementsDatabase.ts`.
- Pending: `clubs/`, `armbands/`, `judges/`, `registrations/`, `show-registrations/`, `users/`, `waitlists/`, `milestones/`, others to be confirmed during ongoing Scope B consolidation of `services/database/queries/`.
