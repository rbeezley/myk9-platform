# Trash View Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the existing `DeletedEntitiesTab` at `/admin/data-lifecycle` to show all 7 soft-delete entity types in collapsible sections with badge counts, lazy loading, restore, and permanent delete.

**Architecture:** The current `DeletedEntitiesTab` receives data as props from the parent `DataLifecycleManagement/index.tsx`. We'll make it self-contained — it manages its own data fetching for counts (eager) and full records (lazy on expand). A new reusable `DeletedEntitySection` component renders each collapsible entity type. The parent sheds all deleted-entity state and just renders `<DeletedEntitiesTab />` with no props.

**Tech Stack:** React, TypeScript, Supabase client queries, shadcn/ui (Card, Button, Badge, AlertDialog, Collapsible), Lucide icons.

**Key finding:** All 7 entity types already have `getDeleted*()`, `restore*()`, `hardDelete*()` query functions:
- Shows: `showQueries.ts` → `getDeletedShows`, `restoreShow`, `hardDeleteShow`
- Trials: `trialQueries.ts` → `getDeletedTrials`, `restoreTrial`, `hardDeleteTrial`
- Classes: `classQueries.ts` → `getDeletedClasses`, `restoreClass`, `hardDeleteClass`
- Entries: `classQueries.entries.ts` → `getDeletedEntries`, `restoreEntry`, `hardDeleteEntry`
- Dogs: `dogQueries.ts` → `getDeletedDogs`, `restoreDog`, `hardDeleteDog`
- Clubs: `clubQueries.ts` → `getDeletedClubs`, `restoreClub`, `hardDeleteClub`
- People: `userQueries.ts` → `getDeletedUsers`, `restoreUser`, `hardDeleteUser`

No new query functions needed. The work is purely UI refactoring.

---

### Task 1: Add Collapsible component from shadcn/ui

The `@myk9/ui` package does not currently have a Collapsible component. We need it for expandable sections.

**Files:**
- Create: `packages/ui/src/components/collapsible.tsx`
- Modify: `packages/ui/src/components/index.ts` (add export)

**Step 1: Install Radix collapsible primitive**

Run from project root:
```bash
cd packages/ui && pnpm add @radix-ui/react-collapsible
```

**Step 2: Create the Collapsible component**

Create `packages/ui/src/components/collapsible.tsx`:
```tsx
'use client';

import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';

const Collapsible = CollapsiblePrimitive.Root;
const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger;
const CollapsibleContent = CollapsiblePrimitive.CollapsibleContent;

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
```

**Step 3: Export from index**

Add to `packages/ui/src/components/index.ts`:
```typescript
export { Collapsible, CollapsibleTrigger, CollapsibleContent } from './collapsible';
```

**Step 4: Verify build**

```bash
pnpm build --filter=@myk9/ui
```
Expected: build passes.

**Step 5: Commit**

```bash
git add packages/ui/src/components/collapsible.tsx packages/ui/src/components/index.ts packages/ui/package.json packages/ui/pnpm-lock.yaml
git commit -m "feat(ui): add Collapsible component from shadcn/ui"
```

---

### Task 2: Enhance `getDeletedTrials` to include `deleted_by_user` join

The current `getDeletedTrials()` only does `select('*')` — it lacks the `deleted_by_user` join needed for the trash view to show who deleted each trial. Other queries (`getDeletedClasses`, `getDeletedUsers`) already have this join.

**Files:**
- Modify: `apps/myk9show/src/services/database/queries/trialQueries.ts:213-219`

**Step 1: Update the query**

Replace the current `getDeletedTrials`:
```typescript
export const getDeletedTrials = async () => {
  return await supabase
    .from('trials')
    .select(`
      *,
      show:shows (id, name),
      deleted_by_user:deleted_by (id, first_name, last_name, email)
    `)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });
};
```

This adds:
- `show` join so we can display which show the trial belonged to
- `deleted_by_user` join so we can display who deleted it (joins to `people` table via `deleted_by` FK)

**Step 2: Verify typecheck**

```bash
pnpm typecheck
```

**Step 3: Commit**

```bash
git add apps/myk9show/src/services/database/queries/trialQueries.ts
git commit -m "feat(queries): add show and deleted_by_user joins to getDeletedTrials"
```

---

### Task 3: Update types.ts — unified `EntityType` and `DeletedEntity` types

The current `types.ts` only supports `'club' | 'dog'` entity types. Expand to support all 7, and add a unified `DeletedEntity` interface for the collapsible section component.

**Files:**
- Modify: `apps/myk9show/src/components/admin/DataLifecycleManagement/types.ts`

**Step 1: Update types**

Add/replace the following in `types.ts`:

```typescript
/** All entity types that support soft delete */
export type EntityType = 'show' | 'trial' | 'class' | 'entry' | 'dog' | 'club' | 'person';

/** Unified shape for displaying a deleted entity in the trash view */
export interface DeletedEntity {
  id: string;
  name: string;
  context?: string; // e.g., "Show: Spring Classic" for a trial
  deleted_at: string | null;
  deleted_by_email?: string | null;
}

/** Entity selected for restore/delete confirmation */
export interface SelectedEntity {
  id: string;
  name: string;
  type: EntityType;
}

/** Configuration for a single entity section in the trash view */
export interface EntitySectionConfig {
  type: EntityType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  fetchDeleted: () => Promise<DeletedEntity[]>;
  restore: (id: string, restoredBy?: string) => Promise<unknown>;
  hardDelete: (id: string) => Promise<unknown>;
}
```

Update `SelectedEntity` to use `EntityType` instead of `'club' | 'dog'`. Remove the `DeletedClub`, `DeletedDog`, `DeletedEntitiesTabProps` interfaces (they'll be replaced). Keep other props interfaces (`OverviewCardsProps`, etc.) for now but remove `deletedClubsCount`/`deletedDogsCount` from `OverviewCardsProps`.

**Step 2: Verify typecheck** (expect errors — we'll fix them in later tasks)

No typecheck yet — dependent files will break until Tasks 4-6 are done.

**Step 3: Commit**

```bash
git add apps/myk9show/src/components/admin/DataLifecycleManagement/types.ts
git commit -m "feat(types): add unified EntityType and DeletedEntity types for trash view"
```

---

### Task 4: Create `DeletedEntitySection` component

A reusable collapsible section that displays deleted records for one entity type. Handles its own expand/collapse state, lazy data loading, and action callbacks.

**Files:**
- Create: `apps/myk9show/src/components/admin/DataLifecycleManagement/DeletedEntitySection.tsx`

**Step 1: Write the component**

```tsx
/**
 * Collapsible section for a single entity type in the trash view.
 * Lazily loads full records on first expand.
 */

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronRight, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import type { DeletedEntity, EntitySectionConfig } from './types';
import { cn } from '@/lib/utils';

interface DeletedEntitySectionProps {
  config: EntitySectionConfig;
  count: number;
  isActionLoading: boolean;
  onRestore: (entityId: string, entityName: string, entityType: string) => void;
  onDelete: (entityId: string, entityName: string, entityType: string) => void;
}

export function DeletedEntitySection({
  config,
  count,
  isActionLoading,
  onRestore,
  onDelete,
}: DeletedEntitySectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<DeletedEntity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  const Icon = config.icon;

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await config.fetchDeleted();
      setItems(data);
      setHasFetched(true);
    } finally {
      setIsLoading(false);
    }
  }, [config]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      if (open && !hasFetched) {
        loadItems();
      }
    },
    [hasFetched, loadItems]
  );

  // Refresh after parent signals an action was completed
  const refresh = useCallback(() => {
    if (hasFetched) loadItems();
  }, [hasFetched, loadItems]);

  // Expose refresh via a stable ref so parent can call it
  // We'll use a simpler approach: parent passes a refresh trigger count
  // Actually, we'll just refetch when count changes (parent updates counts after actions)

  if (count === 0 && !isOpen) return null;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Unknown';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 30) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <Collapsible open={isOpen} onOpenChange={handleOpenChange}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-muted/50 transition-colors text-left">
          <ChevronRight
            className={cn('h-4 w-4 text-muted-foreground transition-transform', isOpen && 'rotate-90')}
          />
          <Icon className={cn('h-5 w-5', config.iconColor)} />
          <span className="font-medium">{config.label}</span>
          <Badge variant="secondary" className="ml-auto">
            {count}
          </Badge>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-12 space-y-2 pb-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-2">Loading...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No deleted {config.label.toLowerCase()} found.</p>
          ) : (
            <>
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {item.context && (
                        <>
                          <span>{item.context}</span>
                          <span>·</span>
                        </>
                      )}
                      <span>Deleted {formatDate(item.deleted_at)}</span>
                      {item.deleted_by_email && (
                        <>
                          <span>by</span>
                          <span>{item.deleted_by_email}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 ml-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="!border-green-200/20 !bg-green-50/10 hover:!bg-green-50/20 !text-green-700 hover:!text-green-800"
                      onClick={() => onRestore(item.id, item.name, config.type)}
                      disabled={isActionLoading}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Restore
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="!border-red-200/20 !bg-red-50/10 hover:!bg-red-50/20 !text-red-700 hover:!text-red-800"
                      onClick={() => onDelete(item.id, item.name, config.type)}
                      disabled={isActionLoading}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                size="sm"
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={() => loadItems()}
                disabled={isLoading}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Refresh
              </Button>
            </>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
```

**Step 2: Verify typecheck**

```bash
pnpm typecheck
```

**Step 3: Commit**

```bash
git add apps/myk9show/src/components/admin/DataLifecycleManagement/DeletedEntitySection.tsx
git commit -m "feat(admin): add DeletedEntitySection collapsible component"
```

---

### Task 5: Rewrite `DeletedEntitiesTab` — self-contained with all 7 entity types

Replace the current props-driven component with a self-contained one that manages its own data fetching, counts, confirmation dialogs, and renders 7 collapsible sections.

**Files:**
- Rewrite: `apps/myk9show/src/components/admin/DataLifecycleManagement/DeletedEntitiesTab.tsx`

**Step 1: Rewrite the component**

The new component:
- Fetches counts for all 7 entity types on mount (parallel, `head: true`)
- Renders `DeletedEntitySection` for each type with count > 0
- Shows "Trash is empty" when all counts are zero
- Manages its own confirmation dialogs (restore + delete)
- Uses `useAuthContext` for `restoredBy` user ID
- Maps each entity type's raw query result to the unified `DeletedEntity` shape

```tsx
/**
 * Deleted Entities tab — self-contained trash view for all soft-deleted records.
 * Manages its own data fetching, confirmation dialogs, and actions.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Theater,
  Trophy,
  ListChecks,
  ClipboardList,
  Dog,
  Building2,
  Users,
  Trash2,
  AlertTriangle,
  Shield,
} from 'lucide-react';
import { supabase } from '@/services/database/supabaseClient';
import { getDeletedShows, restoreShow, hardDeleteShow } from '@/services/database/queries/showQueries';
import { getDeletedTrials, restoreTrial, hardDeleteTrial } from '@/services/database/queries/trialQueries';
import { getDeletedClasses, restoreClass, hardDeleteClass } from '@/services/database/queries/classQueries';
import { getDeletedEntries, restoreEntry, hardDeleteEntry } from '@/services/database/queries/classQueries';
import { getDeletedDogs, restoreDog, hardDeleteDog } from '@/services/database/queries/dogQueries';
import { getDeletedClubs, restoreClub, hardDeleteClub } from '@/services/database/queries/clubQueries';
import { getDeletedUsers, restoreUser, hardDeleteUser } from '@/services/database/queries/userQueries';
import { useAuthContext } from '@/hooks/useAuthContext';
import { logger } from '@/services/LoggingService';
import { DeletedEntitySection } from './DeletedEntitySection';
import type { DeletedEntity, EntityType, EntitySectionConfig, SelectedEntity } from './types';

/** Table names in Supabase for count queries */
const TABLE_NAMES: Record<EntityType, string> = {
  show: 'shows',
  trial: 'trials',
  class: 'classes',
  entry: 'entries',
  dog: 'dogs',
  club: 'clubs',
  person: 'people',
};

/** Map raw query results to unified DeletedEntity shape */
function mapShow(row: Record<string, unknown>): DeletedEntity {
  return {
    id: row.id as string,
    name: (row.name as string) || 'Unnamed Show',
    deleted_at: row.deleted_at as string | null,
    deleted_by_email: (row.deleted_by_user as Record<string, unknown>)?.email as string | undefined,
  };
}

function mapTrial(row: Record<string, unknown>): DeletedEntity {
  const show = row.show as Record<string, unknown> | null;
  return {
    id: row.id as string,
    name: (row.name as string) || 'Unnamed Trial',
    context: show ? `Show: ${show.name}` : undefined,
    deleted_at: row.deleted_at as string | null,
    deleted_by_email: (row.deleted_by_user as Record<string, unknown>)?.email as string | undefined,
  };
}

function mapClass(row: Record<string, unknown>): DeletedEntity {
  const trial = row.trial as Record<string, unknown> | null;
  return {
    id: row.id as string,
    name: (row.name as string) || 'Unnamed Class',
    context: trial ? `Trial: ${trial.name}` : undefined,
    deleted_at: row.deleted_at as string | null,
    deleted_by_email: (row.deleted_by_user as Record<string, unknown>)?.email as string | undefined,
  };
}

function mapEntry(row: Record<string, unknown>): DeletedEntity {
  const dog = row.dog as Record<string, unknown> | null;
  const cls = row.class as Record<string, unknown> | null;
  const dogName = dog ? (dog.name as string) : 'Unknown Dog';
  const className = cls ? (cls.name as string) : 'Unknown Class';
  return {
    id: row.id as string,
    name: `${dogName} → ${className}`,
    context: cls ? `Class: ${className}` : undefined,
    deleted_at: row.deleted_at as string | null,
    deleted_by_email: (row.deleted_by_user as Record<string, unknown>)?.email as string | undefined,
  };
}

function mapDog(row: Record<string, unknown>): DeletedEntity {
  return {
    id: row.id as string,
    name: (row.name as string) || 'Unnamed Dog',
    context: row.breed as string | undefined,
    deleted_at: row.deleted_at as string | null,
    deleted_by_email: (row.deleted_by_user as Record<string, unknown>)?.email as string | undefined,
  };
}

function mapClub(row: Record<string, unknown>): DeletedEntity {
  return {
    id: row.id as string,
    name: (row.name as string) || 'Unnamed Club',
    deleted_at: row.deleted_at as string | null,
    deleted_by_email: (row.deleted_by_user as Record<string, unknown>)?.email as string | undefined,
  };
}

function mapPerson(row: Record<string, unknown>): DeletedEntity {
  const firstName = (row.first_name as string) || '';
  const lastName = (row.last_name as string) || '';
  return {
    id: row.id as string,
    name: `${firstName} ${lastName}`.trim() || 'Unnamed Person',
    context: row.email as string | undefined,
    deleted_at: row.deleted_at as string | null,
    deleted_by_email: (row.deleted_by_user as Record<string, unknown>)?.email as string | undefined,
  };
}

/** Labels for entity types (used in confirmation dialogs) */
const ENTITY_LABELS: Record<EntityType, string> = {
  show: 'Show',
  trial: 'Trial',
  class: 'Class',
  entry: 'Entry',
  dog: 'Dog',
  club: 'Club',
  person: 'Person',
};

export function DeletedEntitiesTab() {
  const [counts, setCounts] = useState<Record<EntityType, number>>({
    show: 0, trial: 0, class: 0, entry: 0, dog: 0, club: 0, person: 0,
  });
  const [isLoadingCounts, setIsLoadingCounts] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { userWithRoles } = useAuthContext();

  // Fetch counts for all entity types
  const loadCounts = useCallback(async () => {
    setIsLoadingCounts(true);
    try {
      const entityTypes = Object.keys(TABLE_NAMES) as EntityType[];
      const results = await Promise.all(
        entityTypes.map(async (type) => {
          const { count, error } = await supabase
            .from(TABLE_NAMES[type])
            .select('id', { count: 'exact', head: true })
            .not('deleted_at', 'is', null);
          if (error) {
            logger.error(`Failed to count deleted ${type}s`, 'trash', {}, new Error(error.message));
            return { type, count: 0 };
          }
          return { type, count: count || 0 };
        })
      );
      const newCounts = {} as Record<EntityType, number>;
      for (const { type, count } of results) {
        newCounts[type] = count;
      }
      setCounts(newCounts);
    } finally {
      setIsLoadingCounts(false);
    }
  }, []);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  // Section configurations
  const sections: EntitySectionConfig[] = useMemo(
    () => [
      {
        type: 'show' as EntityType,
        label: 'Shows',
        icon: Theater,
        iconColor: 'text-purple-600',
        fetchDeleted: async () => {
          const result = await getDeletedShows();
          return (result.data || []).map((r: unknown) => mapShow(r as Record<string, unknown>));
        },
        restore: restoreShow,
        hardDelete: hardDeleteShow,
      },
      {
        type: 'trial' as EntityType,
        label: 'Trials',
        icon: Trophy,
        iconColor: 'text-amber-600',
        fetchDeleted: async () => {
          const result = await getDeletedTrials();
          return (result.data || []).map((r: unknown) => mapTrial(r as Record<string, unknown>));
        },
        restore: restoreTrial,
        hardDelete: hardDeleteTrial,
      },
      {
        type: 'class' as EntityType,
        label: 'Classes',
        icon: ListChecks,
        iconColor: 'text-blue-600',
        fetchDeleted: async () => {
          const result = await getDeletedClasses();
          return (result.data || []).map((r: unknown) => mapClass(r as Record<string, unknown>));
        },
        restore: restoreClass,
        hardDelete: hardDeleteClass,
      },
      {
        type: 'entry' as EntityType,
        label: 'Entries',
        icon: ClipboardList,
        iconColor: 'text-green-600',
        fetchDeleted: async () => {
          const result = await getDeletedEntries();
          return (result.data || []).map((r: unknown) => mapEntry(r as Record<string, unknown>));
        },
        restore: restoreEntry,
        hardDelete: hardDeleteEntry,
      },
      {
        type: 'dog' as EntityType,
        label: 'Dogs',
        icon: Dog,
        iconColor: 'text-orange-600',
        fetchDeleted: async () => {
          const result = await getDeletedDogs();
          return (result.data || []).map((r: unknown) => mapDog(r as Record<string, unknown>));
        },
        restore: restoreDog,
        hardDelete: hardDeleteDog,
      },
      {
        type: 'club' as EntityType,
        label: 'Clubs',
        icon: Building2,
        iconColor: 'text-teal-600',
        fetchDeleted: async () => {
          const result = await getDeletedClubs();
          return (result.data || []).map((r: unknown) => mapClub(r as Record<string, unknown>));
        },
        restore: restoreClub,
        hardDelete: hardDeleteClub,
      },
      {
        type: 'person' as EntityType,
        label: 'People',
        icon: Users,
        iconColor: 'text-indigo-600',
        fetchDeleted: async () => {
          const result = await getDeletedUsers();
          return (result.data || []).map((r: unknown) => mapPerson(r as Record<string, unknown>));
        },
        restore: restoreUser,
        hardDelete: hardDeleteUser,
      },
    ],
    []
  );

  // Action handlers
  const handleRestore = useCallback(
    (entityId: string, entityName: string, entityType: string) => {
      setSelectedEntity({ id: entityId, name: entityName, type: entityType as EntityType });
      setShowRestoreDialog(true);
    },
    []
  );

  const handleDelete = useCallback(
    (entityId: string, entityName: string, entityType: string) => {
      setSelectedEntity({ id: entityId, name: entityName, type: entityType as EntityType });
      setShowDeleteDialog(true);
    },
    []
  );

  const handleConfirmRestore = useCallback(async () => {
    if (!selectedEntity) return;
    setIsActionLoading(true);
    try {
      const config = sections.find((s) => s.type === selectedEntity.type);
      if (!config) return;
      await config.restore(selectedEntity.id, userWithRoles?.databaseUserId);
      logger.info(`${ENTITY_LABELS[selectedEntity.type]} restored`, 'trash', { id: selectedEntity.id });
      await loadCounts();
    } catch (error) {
      logger.error(`Failed to restore ${selectedEntity.type}`, 'trash', { id: selectedEntity.id }, error as Error);
    } finally {
      setIsActionLoading(false);
      setShowRestoreDialog(false);
      setSelectedEntity(null);
    }
  }, [selectedEntity, sections, userWithRoles, loadCounts]);

  const handleConfirmDelete = useCallback(async () => {
    if (!selectedEntity) return;
    setIsActionLoading(true);
    try {
      const config = sections.find((s) => s.type === selectedEntity.type);
      if (!config) return;
      await config.hardDelete(selectedEntity.id);
      logger.info(`${ENTITY_LABELS[selectedEntity.type]} permanently deleted`, 'trash', { id: selectedEntity.id });
      await loadCounts();
    } catch (error) {
      logger.error(`Failed to delete ${selectedEntity.type}`, 'trash', { id: selectedEntity.id }, error as Error);
    } finally {
      setIsActionLoading(false);
      setShowDeleteDialog(false);
      setSelectedEntity(null);
    }
  }, [selectedEntity, sections, loadCounts]);

  const totalCount = Object.values(counts).reduce((sum, c) => sum + c, 0);

  return (
    <div className="space-y-6">
      <Card className="border border-border rounded-2xl">
        <CardContent className="pt-6">
          {isLoadingCounts ? (
            <p className="text-muted-foreground text-center py-8">Loading trash...</p>
          ) : totalCount === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <Trash2 className="h-12 w-12 opacity-30" />
              <p className="text-lg font-medium">Trash is empty</p>
              <p className="text-sm">No soft-deleted records found.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {sections.map((config) => (
                <DeletedEntitySection
                  key={config.type}
                  config={config}
                  count={counts[config.type]}
                  isActionLoading={isActionLoading}
                  onRestore={handleRestore}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Admin info card */}
      <Card className="border border-border rounded-2xl">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-purple-600" />
            <h3 className="font-semibold">Soft Delete Management</h3>
          </div>
          <Alert className="!border-amber-200/20 !bg-amber-50/10">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Restore</strong> returns a deleted record to active status.
              <br />
              <strong>Delete Forever</strong> permanently removes it from the database. This cannot be undone.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Restore confirmation */}
      <AlertDialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Restore {selectedEntity ? ENTITY_LABELS[selectedEntity.type] : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to restore &quot;{selectedEntity?.name}&quot;? It will be visible and active again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRestore}
              disabled={isActionLoading}
              className="bg-green-500 hover:bg-green-600"
            >
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete forever confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Permanently Delete {selectedEntity ? ENTITY_LABELS[selectedEntity.type] : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{selectedEntity?.name}&quot;. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isActionLoading}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete Forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

**Step 2: Verify typecheck**

```bash
pnpm typecheck
```

**Step 3: Commit**

```bash
git add apps/myk9show/src/components/admin/DataLifecycleManagement/DeletedEntitiesTab.tsx
git commit -m "feat(admin): rewrite DeletedEntitiesTab with collapsible sections for all 7 entity types"
```

---

### Task 6: Update parent `index.tsx` — remove deleted-entity state

The parent `DataLifecycleManagement/index.tsx` currently manages all deleted-entity state (loading, fetching, dialog handlers). Since `DeletedEntitiesTab` is now self-contained, remove all that state.

**Files:**
- Modify: `apps/myk9show/src/components/admin/DataLifecycleManagement/index.tsx`

**Step 1: Remove deleted-entity state and handlers from index.tsx**

Remove:
- `deletedClubs` / `deletedDogs` state
- `isLoadingDeleted` state
- `showRestoreDialog` / `showDeleteDialog` / `selectedEntity` state
- `loadDeletedEntities` callback and its `useEffect`
- `handleShowRestoreDialog` / `handleConfirmRestore` / `handleShowDeleteDialog` / `handleConfirmDelete` handlers
- Imports: `getDeletedClubs`, `restoreClub`, `hardDeleteClub`, `getDeletedDogs`, `restoreDog`, `hardDeleteDog`, `useAuthContext`
- `ConfirmationDialogs` component render and import
- `deletedClubsCount`/`deletedDogsCount` props from `OverviewCards`

Update:
- `<DeletedEntitiesTab />` renders with no props
- `OverviewCards` no longer receives deleted counts (remove those props or pass nothing)

**Step 2: Update `OverviewCards` if it uses deleted counts**

Check `OverviewCards.tsx` — if it displays deleted club/dog counts, remove those or replace with a generic "View Trash tab" message.

**Step 3: Remove `ConfirmationDialogs.tsx`**

Since the confirmation dialogs are now inside `DeletedEntitiesTab`, the standalone `ConfirmationDialogs` component is no longer needed. Delete the file.

**Step 4: Clean up `types.ts`**

Remove any now-unused interfaces: `DeletedClub`, `DeletedDog`, `DeletedEntitiesTabProps`, `ConfirmationDialogsProps`. Keep `OverviewCardsProps` but remove `deletedClubsCount`/`deletedDogsCount` fields from it.

**Step 5: Verify typecheck**

```bash
pnpm typecheck
```

**Step 6: Commit**

```bash
git add -u apps/myk9show/src/components/admin/DataLifecycleManagement/
git commit -m "refactor(admin): remove deleted-entity state from parent, DeletedEntitiesTab is self-contained"
```

---

### Task 7: Write tests for DeletedEntitySection

**Files:**
- Create: `apps/myk9show/src/components/admin/DataLifecycleManagement/__tests__/DeletedEntitySection.test.tsx`

**Step 1: Write tests**

Test cases:
1. Does not render when count is 0 and section is collapsed
2. Renders section header with icon, label, and badge count
3. Expands on click and calls fetchDeleted
4. Shows loading state while fetching
5. Renders entity items with name, context, deletion info
6. Calls onRestore with correct args when Restore button clicked
7. Calls onDelete with correct args when Delete button clicked
8. Disables action buttons when isActionLoading is true
9. Refresh button refetches data

Use `vitest`, `@testing-library/react`, mock the config's `fetchDeleted`/`restore`/`hardDelete`.

**Step 2: Run tests**

```bash
cd apps/myk9show && pnpm test -- DeletedEntitySection
```

**Step 3: Commit**

```bash
git add apps/myk9show/src/components/admin/DataLifecycleManagement/__tests__/DeletedEntitySection.test.tsx
git commit -m "test(admin): add DeletedEntitySection unit tests"
```

---

### Task 8: Write tests for DeletedEntitiesTab

**Files:**
- Create: `apps/myk9show/src/components/admin/DataLifecycleManagement/__tests__/DeletedEntitiesTab.test.tsx`

**Step 1: Write tests**

Test cases:
1. Shows "Loading trash..." while counts are loading
2. Shows "Trash is empty" when all counts are 0
3. Renders sections for entity types with count > 0
4. Does not render sections for entity types with count = 0
5. Shows restore confirmation dialog when Restore clicked
6. Shows delete confirmation dialog when Delete clicked
7. Calls restore function and refreshes counts on confirm restore
8. Calls hardDelete function and refreshes counts on confirm delete

Mock `supabase` for count queries and all `getDeleted*`/`restore*`/`hardDelete*` imports. Mock `useAuthContext`.

**Step 2: Run tests**

```bash
cd apps/myk9show && pnpm test -- DeletedEntitiesTab
```

**Step 3: Commit**

```bash
git add apps/myk9show/src/components/admin/DataLifecycleManagement/__tests__/DeletedEntitiesTab.test.tsx
git commit -m "test(admin): add DeletedEntitiesTab unit tests"
```

---

### Task 9: Final verification and cleanup

**Step 1: Run full typecheck**

```bash
pnpm typecheck
```

**Step 2: Run full test suite for myk9show**

```bash
cd apps/myk9show && pnpm test
```

**Step 3: Run lint**

```bash
pnpm lint
```

**Step 4: Fix any issues found**

**Step 5: Final commit if needed**

```bash
git commit -m "chore: fix lint/type issues from trash view implementation"
```
