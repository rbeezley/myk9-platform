# Armband Lookup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an inline armband number lookup to ShowDetailsPage so ringside staff can instantly find a dog and its entries by armband number.

**Architecture:** New `armbandQueries.ts` for Supabase queries, `useArmbandLookup.ts` for React Query hooks, and `ArmbandLookup.tsx` for the self-contained input+popover component. Integrated into ShowDetailsPage's header actions area.

**Tech Stack:** React, TypeScript, Supabase (armbands/dogs/entries tables), React Query, shadcn/ui Popover, Lucide icons.

---

### Task 1: Create armbandQueries.ts

**Files:**
- Create: `apps/myk9show/src/services/database/queries/armbandQueries.ts`

**Step 1: Create the query file**

```typescript
import { supabase, logQuery, createDatabaseError } from '../supabaseClient';

/**
 * Count armbands assigned for a show.
 * Used to conditionally render the armband lookup input.
 */
export const getArmbandCountForShow = async (showId: string) => {
  const startTime = Date.now();
  try {
    const { count, error } = await supabase
      .from('armbands')
      .select('id', { count: 'exact', head: true })
      .eq('show_id', showId);

    logQuery('armbands', 'count', Date.now() - startTime, error?.message);
    if (error) throw createDatabaseError(error, 'armbands', 'count');
    return { count: count ?? 0, error: null };
  } catch (error) {
    logQuery('armbands', 'count', Date.now() - startTime, (error as Error).message);
    return { count: 0, error: createDatabaseError(error) };
  }
};

/**
 * Look up a dog by armband number at a specific show.
 * Returns dog info, owner, and entries at the show.
 */
export const lookupDogByArmband = async (showId: string, armbandNumber: string) => {
  const startTime = Date.now();
  try {
    // Step 1: Find the armband record with dog info
    const { data: armbandData, error: armbandError } = await supabase
      .from('armbands')
      .select(`
        armband_number,
        dog:dogs (
          id,
          name,
          breed,
          sex,
          owner:people!dogs_owner_fkey (
            first_name,
            last_name
          )
        )
      `)
      .eq('show_id', showId)
      .eq('armband_number', armbandNumber)
      .maybeSingle();

    logQuery('armbands', 'lookup', Date.now() - startTime, armbandError?.message);
    if (armbandError) throw createDatabaseError(armbandError, 'armbands', 'lookup');
    if (!armbandData?.dog) return { data: null, error: null };

    // Step 2: Fetch entries for this dog at this show
    const dogId = (armbandData.dog as { id: string }).id;
    const { data: entriesData, error: entriesError } = await supabase
      .from('entries')
      .select(`
        id,
        entry_status,
        handler,
        class:class_id (
          name,
          level
        )
      `)
      .eq('dog_id', dogId)
      .eq('show_id', showId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (entriesError) {
      logQuery('entries', 'lookup_by_dog', Date.now() - startTime, entriesError.message);
    }

    const dog = armbandData.dog as {
      id: string;
      name: string;
      breed: string;
      sex: string;
      owner: { first_name: string; last_name: string } | null;
    };

    return {
      data: {
        armband_number: armbandData.armband_number,
        dog: {
          id: dog.id,
          name: dog.name,
          breed: dog.breed,
          sex: dog.sex,
        },
        owner: dog.owner
          ? { first_name: dog.owner.first_name, last_name: dog.owner.last_name }
          : { first_name: 'Unknown', last_name: '' },
        entries: (entriesData || []).map((e) => {
          const cls = e.class as { name: string; level: string | null } | null;
          return {
            id: e.id,
            entry_status: e.entry_status,
            handler: e.handler,
            class_name: cls?.name ?? 'Unknown Class',
            class_level: cls?.level ?? null,
          };
        }),
      },
      error: null,
    };
  } catch (error) {
    logQuery('armbands', 'lookup', Date.now() - startTime, (error as Error).message);
    return { data: null, error: createDatabaseError(error) };
  }
};
```

**Step 2: Verify typecheck**

```bash
pnpm typecheck
```

**Step 3: Commit**

```bash
git add apps/myk9show/src/services/database/queries/armbandQueries.ts
git commit -m "feat(queries): add armbandQueries with count and lookup functions"
```

---

### Task 2: Create useArmbandLookup React Query hooks

**Files:**
- Create: `apps/myk9show/src/hooks/queries/useArmbandLookup.ts`

**Step 1: Create the hooks file**

```typescript
import { useQuery } from '@tanstack/react-query';
import { getArmbandCountForShow, lookupDogByArmband } from '@/services/database/queries/armbandQueries';
import { cacheStrategies } from '@/lib/queryClient';

/** Query key factory for armband queries */
export const armbandQueryKeys = {
  count: (showId: string) => ['armbands', 'count', showId] as const,
  lookup: (showId: string, armbandNumber: string) =>
    ['armbands', 'lookup', showId, armbandNumber] as const,
};

/** Check if a show has any armbands assigned. Used to conditionally render lookup input. */
export function useArmbandCount(showId: string | undefined) {
  return useQuery({
    queryKey: armbandQueryKeys.count(showId ?? ''),
    queryFn: async () => {
      const result = await getArmbandCountForShow(showId!);
      if (result.error) throw result.error;
      return result.count;
    },
    enabled: !!showId,
    ...cacheStrategies.moderate,
  });
}

/** Look up a dog by armband number at a specific show. Only fires when armbandNumber is set. */
export function useArmbandLookup(showId: string | undefined, armbandNumber: string | null) {
  return useQuery({
    queryKey: armbandQueryKeys.lookup(showId ?? '', armbandNumber ?? ''),
    queryFn: async () => {
      const result = await lookupDogByArmband(showId!, armbandNumber!);
      if (result.error) throw result.error;
      return result.data;
    },
    enabled: !!showId && !!armbandNumber,
    staleTime: 0,
    gcTime: 1000 * 60 * 2,
  });
}
```

**Step 2: Verify typecheck**

```bash
pnpm typecheck
```

**Step 3: Commit**

```bash
git add apps/myk9show/src/hooks/queries/useArmbandLookup.ts
git commit -m "feat(hooks): add useArmbandCount and useArmbandLookup React Query hooks"
```

---

### Task 3: Create ArmbandLookup component

**Files:**
- Create: `apps/myk9show/src/components/shows/ArmbandLookup.tsx`

**Step 1: Create the component**

```tsx
/**
 * Armband number lookup input with popover result card.
 * Rendered in ShowDetailsPage header when armbands exist for the show.
 */

import { useState, useCallback, useRef } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, Dog, User, ClipboardList } from 'lucide-react';
import { useArmbandLookup } from '@/hooks/queries/useArmbandLookup';
import { Link } from 'react-router-dom';

interface ArmbandLookupProps {
  showId: string;
}

export function ArmbandLookup({ showId }: ArmbandLookupProps) {
  const [inputValue, setInputValue] = useState('');
  const [searchNumber, setSearchNumber] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, isError } = useArmbandLookup(showId, searchNumber);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = inputValue.trim();
      if (!trimmed) return;
      setSearchNumber(trimmed);
      setIsOpen(true);
    },
    [inputValue]
  );

  const handleClear = useCallback(() => {
    setInputValue('');
    setSearchNumber(null);
    setIsOpen(false);
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      if (!open) {
        // Keep input value for quick re-search, but close popover
      }
    },
    []
  );

  const handleInputFocus = useCallback(() => {
    inputRef.current?.select();
  }, []);

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <form onSubmit={handleSubmit} className="flex items-center">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            {isLoading && (
              <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground animate-spin" />
            )}
            <Input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              placeholder="Armband #"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onFocus={handleInputFocus}
              className="w-[120px] h-9 pl-8 pr-8 text-sm"
            />
          </div>
        </form>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Looking up...
          </div>
        ) : isError ? (
          <div className="p-4 text-sm text-muted-foreground text-center">
            Lookup failed — try again
          </div>
        ) : !data ? (
          <div className="p-4 text-sm text-muted-foreground text-center">
            No dog found with armband #{searchNumber}
          </div>
        ) : (
          <div>
            {/* Dog info section */}
            <div className="p-4 border-b border-border">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Dog className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold text-base">{data.dog.name}</span>
                </div>
                <Badge variant="secondary" className="text-xs font-mono">
                  #{data.armband_number}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground space-y-0.5">
                <p>
                  {data.dog.breed} · {data.dog.sex}
                </p>
                <p className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {data.owner.first_name} {data.owner.last_name}
                </p>
              </div>
              <Link
                to={`/dogs/${data.dog.id}`}
                className="text-xs text-primary hover:underline mt-2 inline-block"
                onClick={() => setIsOpen(false)}
              >
                View full profile →
              </Link>
            </div>

            {/* Entries section */}
            <div className="p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">
                  Entries at this show ({data.entries.length})
                </span>
              </div>
              {data.entries.length === 0 ? (
                <p className="text-xs text-muted-foreground">No entries found</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {data.entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/30 text-sm"
                    >
                      <div className="min-w-0">
                        <span className="font-medium truncate block">
                          {entry.class_name}
                          {entry.class_level && (
                            <span className="text-muted-foreground font-normal">
                              {' '}
                              · {entry.class_level}
                            </span>
                          )}
                        </span>
                        {entry.handler && (
                          <span className="text-xs text-muted-foreground block">
                            Handler: {entry.handler}
                          </span>
                        )}
                      </div>
                      <Badge
                        variant="outline"
                        className="text-[10px] shrink-0 ml-2"
                      >
                        {entry.entry_status || 'registered'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
```

**Step 2: Verify typecheck**

```bash
pnpm typecheck
```

**Step 3: Commit**

```bash
git add apps/myk9show/src/components/shows/ArmbandLookup.tsx
git commit -m "feat(shows): add ArmbandLookup component with popover result card"
```

---

### Task 4: Integrate into ShowDetailsPage

**Files:**
- Modify: `apps/myk9show/src/pages/ShowDetailsPage.tsx`

**Step 1: Add imports and hook call**

Add imports near the top of the file (with other imports):
```typescript
import { ArmbandLookup } from '@/components/shows/ArmbandLookup';
import { useArmbandCount } from '@/hooks/queries/useArmbandLookup';
```

Inside the component, after existing hook calls (around line 60-70), add:
```typescript
const { data: armbandCount } = useArmbandCount(actualCurrentShow?.id);
```

**Step 2: Add ArmbandLookup to the PageHeader actions**

Find the `<PageHeader>` JSX (line 275-301). Modify the `actions` prop to include the armband lookup alongside the existing Edit button. The lookup should render for ALL users when armbands exist, not just `canManageShow`:

Replace the `actions` prop:
```tsx
actions={
  <div className="flex items-center gap-2">
    {(armbandCount ?? 0) > 0 && actualCurrentShow?.id && (
      <ArmbandLookup showId={actualCurrentShow.id} />
    )}
    {canManageShow && (
      <div className="flex items-center gap-1">
        <button
          onClick={() => setShowEditPanel(true)}
          className="h-10 px-4 text-sm font-medium rounded-lg border border-border bg-background hover:bg-accent transition-colors"
        >
          <Pencil className="h-4 w-4 mr-2 inline-block" />
          Edit
        </button>
        <ThreeDotMenu
          items={[
            {
              label: 'Delete Show',
              icon: <Trash2 className="h-4 w-4" />,
              onClick: () => setShowDeleteDialog(true),
              className: 'text-destructive',
            },
          ]}
        />
      </div>
    )}
  </div>
}
```

Note: `actions` now always renders a `<div>` (not conditionally `undefined`) because the armband lookup can appear for any user. The Edit/Delete buttons remain gated by `canManageShow`.

**Step 3: Verify typecheck**

```bash
pnpm typecheck
```

**Step 4: Commit**

```bash
git add apps/myk9show/src/pages/ShowDetailsPage.tsx
git commit -m "feat(shows): integrate ArmbandLookup into ShowDetailsPage header"
```

---

### Task 5: Write tests for ArmbandLookup component

**Files:**
- Create: `apps/myk9show/src/components/shows/__tests__/ArmbandLookup.test.tsx`

**Step 1: Write tests**

Test cases:
1. Renders input with placeholder "Armband #"
2. Does not fire query on empty input submission
3. Fires query on valid input submission
4. Shows "Looking up..." loading state
5. Shows dog info and entries on success
6. Shows "No dog found" when result is null
7. Shows "Lookup failed" on error
8. Shows handler when handler differs from owner
9. Shows "View full profile" link with correct dog URL

Mock `useArmbandLookup` hook to control return values. Mock `react-router-dom` Link.

**Step 2: Run tests**

```bash
cd apps/myk9show && npx vitest run ArmbandLookup
```

**Step 3: Commit**

```bash
git add apps/myk9show/src/components/shows/__tests__/ArmbandLookup.test.tsx
git commit -m "test(shows): add ArmbandLookup unit tests"
```

---

### Task 6: Final verification

**Step 1: Run typecheck**

```bash
pnpm typecheck
```

**Step 2: Run all tests for myk9show**

```bash
cd apps/myk9show && npx vitest run ArmbandLookup
```

**Step 3: Run lint**

```bash
pnpm lint
```

**Step 4: Fix any issues**

**Step 5: Commit if needed**

```bash
git commit -m "chore: fix lint/type issues from armband lookup"
```
