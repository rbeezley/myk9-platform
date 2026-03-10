# Show Announcements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add show-scoped announcements with persistent storage, admin CRUD, realtime delivery, and integration into the existing NotificationCenter/NotificationBell UI.

**Architecture:** Supabase tables (`show_announcements` + `show_announcement_reads`) with RLS, a Zustand store with realtime subscriptions as the sole data layer, and UI integration into the existing notification components plus a new Mission Control card.

**Tech Stack:** Supabase (Postgres + Realtime), Zustand, React, Tailwind CSS, Lucide icons, vitest

**Spec:** `docs/superpowers/specs/2026-03-10-show-announcements-design.md`

---

## File Structure

| File                                                                      | Action | Responsibility                                |
| ------------------------------------------------------------------------- | ------ | --------------------------------------------- |
| `supabase/migrations/057_announcements.sql`                               | Create | DB tables, indexes, RLS, trigger              |
| `apps/myk9show/src/types/announcement-types.ts`                           | Create | TypeScript interfaces for announcements       |
| `apps/myk9show/src/services/database/queries/announcementQueries.ts`      | Create | Supabase CRUD functions                       |
| `apps/myk9show/src/store/announcementStore.ts`                            | Create | Zustand store with realtime                   |
| `apps/myk9show/src/hooks/useAnnouncementSubscription.ts`                  | Create | Lifecycle hook for app layout                 |
| `apps/myk9show/src/components/announcements/CreateAnnouncementDialog.tsx` | Create | Create/edit form dialog                       |
| `apps/myk9show/src/components/announcements/AnnouncementItem.tsx`         | Create | Single announcement display component         |
| `apps/myk9show/src/features/pipeline/components/AnnouncementsCard.tsx`    | Create | Mission Control dashboard card                |
| `apps/myk9show/src/components/notifications/NotificationCenter.tsx`       | Modify | Announcements tab reads from store            |
| `apps/myk9show/src/components/notifications/NotificationBell.tsx`         | Modify | Combined unread count                         |
| `apps/myk9show/src/App.tsx`                                               | Modify | Mount subscription hook (inside AuthProvider) |
| `apps/myk9show/src/features/pipeline/components/PipelineDashboard.tsx`    | Modify | Add AnnouncementsCard                         |

**Test files:**

| File                                                                                     | Tests for                            |
| ---------------------------------------------------------------------------------------- | ------------------------------------ |
| `apps/myk9show/src/services/database/queries/__tests__/announcementQueries.test.ts`      | Supabase CRUD                        |
| `apps/myk9show/src/store/__tests__/announcementStore.test.ts`                            | Store actions, optimistic updates    |
| `apps/myk9show/src/components/announcements/__tests__/CreateAnnouncementDialog.test.tsx` | Form validation, submit, role gating |
| `apps/myk9show/src/components/announcements/__tests__/AnnouncementItem.test.tsx`         | Render, actions                      |
| `apps/myk9show/src/features/pipeline/components/__tests__/AnnouncementsCard.test.tsx`    | Card render, CRUD, empty state       |
| `apps/myk9show/src/components/notifications/__tests__/NotificationCenter.test.tsx`       | Modify existing: tab switching       |
| `apps/myk9show/src/components/notifications/__tests__/NotificationBell.test.tsx`         | Modify existing: combined count      |

---

## Chunk 1: Database + Types

### Task 1: Create migration

**Files:**

- Create: `supabase/migrations/057_announcements.sql`

**Note on `author_role`:** The spec says `trial_secretary` but the app's `UserRole` enum (in `apps/myk9show/src/types/auth-types.ts`) uses `secretary`. Use `secretary` in the DB CHECK constraint to match the app-layer enum, avoiding a mapping layer. **Deliberate divergence from DB `roles` table** which uses `trial_secretary` — the `author_role` column is display-only (used with `ROLE_LABELS` in the UI), not joined to the `roles` table. If future code needs to join, add a mapping constant.

- [ ] **Step 1: Write the migration file**

```sql
-- Show announcements for officials to communicate with show participants
-- Scoped per-show: users only see announcements for shows they're participating in

-- Announcements table
create table show_announcements (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references shows(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  author_role text not null check (author_role in ('secretary', 'judge', 'club_admin')),
  author_name text,
  title text not null,
  content text not null,
  priority text not null default 'normal' check (priority in ('normal', 'high', 'urgent')),
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Read tracking per user per announcement
create table show_announcement_reads (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references show_announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  read_at timestamptz not null default now(),
  unique(announcement_id, user_id)
);

-- Indexes
create index idx_show_announcements_show_created
  on show_announcements(show_id, created_at desc);
create index idx_show_announcements_expires
  on show_announcements(expires_at)
  where expires_at is not null;
create index idx_show_announcement_reads_user
  on show_announcement_reads(user_id, announcement_id);

-- RLS
alter table show_announcements enable row level security;
alter table show_announcement_reads enable row level security;

-- Announcements: all authenticated users can read
create policy "Authenticated users can read announcements"
  on show_announcements for select
  using (auth.uid() is not null);

-- Announcements: all authenticated users can insert (app layer checks official role)
create policy "Authenticated users can create announcements"
  on show_announcements for insert
  with check (auth.uid() is not null and auth.uid() = author_id);

-- Announcements: author or platform admin can update
create policy "Author or admin can update announcements"
  on show_announcements for update
  using (
    auth.uid() = author_id
    or exists (
      select 1 from user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role_id in (
          select id from roles where name = 'platform_admin'
        )
        and user_roles.is_active = true
    )
  );

-- Announcements: author or platform admin can delete
create policy "Author or admin can delete announcements"
  on show_announcements for delete
  using (
    auth.uid() = author_id
    or exists (
      select 1 from user_roles
      where user_roles.user_id = auth.uid()
        and user_roles.role_id in (
          select id from roles where name = 'platform_admin'
        )
        and user_roles.is_active = true
    )
  );

-- Reads: users manage their own read receipts
create policy "Users manage own read receipts"
  on show_announcement_reads for all
  using (auth.uid() = user_id);

-- Updated_at trigger (function already exists from migration 001)
create trigger update_show_announcements_updated_at
  before update on show_announcements
  for each row
  execute function update_updated_at_column();
```

- [ ] **Step 2: Push migration to Supabase**

Run: `cd supabase && supabase db push`
Expected: Migration applies successfully.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/057_announcements.sql
git commit -m "feat(db): add show_announcements and read tracking tables"
```

### Task 2: Create TypeScript types

**Files:**

- Create: `apps/myk9show/src/types/announcement-types.ts`

- [ ] **Step 1: Write the types file**

```typescript
/** Database row shape for show_announcements */
export interface DbShowAnnouncement {
  id: string;
  show_id: string;
  author_id: string;
  author_role: AnnouncementAuthorRole;
  author_name: string | null;
  title: string;
  content: string;
  priority: AnnouncementPriority;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** UI-facing announcement with computed read status */
export interface ShowAnnouncement extends DbShowAnnouncement {
  is_read: boolean;
}

/** Priority levels matching DB CHECK constraint */
export type AnnouncementPriority = 'normal' | 'high' | 'urgent';

/** Author roles matching DB CHECK constraint and UserRole enum values */
export type AnnouncementAuthorRole = 'secretary' | 'judge' | 'club_admin';

/** Roles allowed to create/manage announcements */
export const ANNOUNCEMENT_OFFICIAL_ROLES: readonly AnnouncementAuthorRole[] = [
  'secretary',
  'judge',
  'club_admin',
] as const;

/** Input for creating an announcement */
export interface CreateAnnouncementInput {
  show_id: string;
  title: string;
  content: string;
  priority: AnnouncementPriority;
  expires_at?: string | null;
}

/** Input for updating an announcement */
export interface UpdateAnnouncementInput {
  title?: string;
  content?: string;
  priority?: AnnouncementPriority;
  expires_at?: string | null;
  is_active?: boolean;
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS (new file, no consumers yet)

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/types/announcement-types.ts
git commit -m "feat(types): add announcement type definitions"
```

---

## Chunk 2: Query Layer + Store

### Task 3: Create announcement queries

**Files:**

- Create: `apps/myk9show/src/services/database/queries/announcementQueries.ts`
- Create: `apps/myk9show/src/services/database/queries/__tests__/announcementQueries.test.ts`

**Reference pattern:** `apps/myk9show/src/services/database/queries/showQueries.ts` — uses `import { supabase } from '../supabaseClient'`, returns `{ data, error }` tuples.

- [ ] **Step 1: Write the query functions**

```typescript
import { supabase } from '../supabaseClient';
import type {
  DbShowAnnouncement,
  ShowAnnouncement,
  CreateAnnouncementInput,
  UpdateAnnouncementInput,
  AnnouncementAuthorRole,
} from '@/types/announcement-types';

/**
 * Fetch active announcements for a show, with read status for current user.
 * Two queries joined client-side (avoids Supabase filtered LEFT JOIN limitation).
 */
export async function fetchShowAnnouncements(showId: string): Promise<ShowAnnouncement[]> {
  const now = new Date().toISOString();

  // Query 1: active, non-expired announcements
  const { data: announcements, error: annError } = await supabase
    .from('show_announcements')
    .select('*')
    .eq('show_id', showId)
    .eq('is_active', true)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('created_at', { ascending: false });

  if (annError) throw annError;
  if (!announcements) return [];

  // Query 2: read IDs for current user
  const announcementIds = announcements.map(a => a.id);
  if (announcementIds.length === 0) return [];

  const { data: reads } = await supabase
    .from('show_announcement_reads')
    .select('announcement_id')
    .in('announcement_id', announcementIds);

  const readSet = new Set((reads ?? []).map(r => r.announcement_id));

  return (announcements as DbShowAnnouncement[]).map(a => ({
    ...a,
    is_read: readSet.has(a.id),
  }));
}

/**
 * Create an announcement. Returns the created row.
 */
export async function createAnnouncement(
  input: CreateAnnouncementInput,
  authorId: string,
  authorRole: AnnouncementAuthorRole,
  authorName: string
): Promise<DbShowAnnouncement> {
  const { data, error } = await supabase
    .from('show_announcements')
    .insert({
      show_id: input.show_id,
      author_id: authorId,
      author_role: authorRole,
      author_name: authorName,
      title: input.title,
      content: input.content,
      priority: input.priority,
      expires_at: input.expires_at ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as DbShowAnnouncement;
}

/**
 * Update an announcement. Returns the updated row.
 */
export async function updateAnnouncement(
  id: string,
  updates: UpdateAnnouncementInput
): Promise<DbShowAnnouncement> {
  const { data, error } = await supabase
    .from('show_announcements')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as DbShowAnnouncement;
}

/**
 * Delete an announcement (hard delete).
 */
export async function deleteAnnouncement(id: string): Promise<void> {
  const { error } = await supabase.from('show_announcements').delete().eq('id', id);

  if (error) throw error;
}

/**
 * Mark a single announcement as read for the current user.
 */
export async function markAnnouncementRead(announcementId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('show_announcement_reads')
    .upsert(
      { announcement_id: announcementId, user_id: userId },
      { onConflict: 'announcement_id,user_id' }
    );

  if (error) throw error;
}

/**
 * Mark all unread announcements in a show as read for the current user.
 */
export async function markAllAnnouncementsRead(
  announcementIds: string[],
  userId: string
): Promise<void> {
  if (announcementIds.length === 0) return;

  const rows = announcementIds.map(id => ({
    announcement_id: id,
    user_id: userId,
  }));

  const { error } = await supabase
    .from('show_announcement_reads')
    .upsert(rows, { onConflict: 'announcement_id,user_id' });

  if (error) throw error;
}
```

- [ ] **Step 2: Write tests for the query functions**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchShowAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  markAnnouncementRead,
  markAllAnnouncementsRead,
} from '../announcementQueries';

// Mock supabase client
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockUpsert = vi.fn();
const mockFrom = vi.fn();

vi.mock('../../supabaseClient', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

function chainMock(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    ...overrides,
  };
  // Make all methods return chain by default
  for (const [key, val] of Object.entries(chain)) {
    if (typeof val === 'function' && !(key in overrides)) {
      (chain[key] as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    }
  }
  return chain;
}

describe('announcementQueries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchShowAnnouncements', () => {
    it('returns announcements with is_read computed from reads table', async () => {
      const announcements = [
        { id: 'a1', show_id: 's1', title: 'Test 1', is_active: true, created_at: '2026-01-01' },
        { id: 'a2', show_id: 's1', title: 'Test 2', is_active: true, created_at: '2026-01-02' },
      ];
      const reads = [{ announcement_id: 'a1' }];

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return chainMock({
            order: vi.fn().mockResolvedValue({ data: announcements, error: null }),
          });
        }
        return chainMock({ in: vi.fn().mockResolvedValue({ data: reads, error: null }) });
      });

      const result = await fetchShowAnnouncements('s1');

      expect(result).toHaveLength(2);
      expect(result[0].is_read).toBe(true);
      expect(result[1].is_read).toBe(false);
    });

    it('returns empty array when no announcements', async () => {
      mockFrom.mockImplementation(() =>
        chainMock({ order: vi.fn().mockResolvedValue({ data: [], error: null }) })
      );

      const result = await fetchShowAnnouncements('s1');
      expect(result).toEqual([]);
    });

    it('throws on supabase error', async () => {
      mockFrom.mockImplementation(() =>
        chainMock({
          order: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
        })
      );

      await expect(fetchShowAnnouncements('s1')).rejects.toThrow('DB error');
    });
  });

  describe('createAnnouncement', () => {
    it('inserts and returns the created row', async () => {
      const created = { id: 'new-1', title: 'New', content: 'Body' };
      mockFrom.mockImplementation(() =>
        chainMock({ single: vi.fn().mockResolvedValue({ data: created, error: null }) })
      );

      const result = await createAnnouncement(
        { show_id: 's1', title: 'New', content: 'Body', priority: 'normal' },
        'user-1',
        'secretary',
        'Jane Doe'
      );

      expect(result).toEqual(created);
      expect(mockFrom).toHaveBeenCalledWith('show_announcements');
    });
  });

  describe('updateAnnouncement', () => {
    it('updates and returns the updated row', async () => {
      const updated = { id: 'a1', title: 'Updated' };
      mockFrom.mockImplementation(() =>
        chainMock({ single: vi.fn().mockResolvedValue({ data: updated, error: null }) })
      );

      const result = await updateAnnouncement('a1', { title: 'Updated' });
      expect(result).toEqual(updated);
    });
  });

  describe('deleteAnnouncement', () => {
    it('deletes without error', async () => {
      mockFrom.mockImplementation(() =>
        chainMock({ eq: vi.fn().mockResolvedValue({ error: null }) })
      );

      await expect(deleteAnnouncement('a1')).resolves.toBeUndefined();
    });
  });

  describe('markAnnouncementRead', () => {
    it('upserts a read record', async () => {
      mockFrom.mockImplementation(() =>
        chainMock({ upsert: vi.fn().mockResolvedValue({ error: null }) })
      );

      await expect(markAnnouncementRead('a1', 'u1')).resolves.toBeUndefined();
    });
  });

  describe('markAllAnnouncementsRead', () => {
    it('upserts multiple read records', async () => {
      mockFrom.mockImplementation(() =>
        chainMock({ upsert: vi.fn().mockResolvedValue({ error: null }) })
      );

      await expect(markAllAnnouncementsRead(['a1', 'a2'], 'u1')).resolves.toBeUndefined();
    });

    it('skips when no IDs provided', async () => {
      await markAllAnnouncementsRead([], 'u1');
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd apps/myk9show && pnpm vitest run src/services/database/queries/__tests__/announcementQueries.test.ts`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/services/database/queries/announcementQueries.ts \
       apps/myk9show/src/services/database/queries/__tests__/announcementQueries.test.ts
git commit -m "feat(queries): add announcement CRUD query functions with tests"
```

### Task 4: Create announcement store

**Files:**

- Create: `apps/myk9show/src/store/announcementStore.ts`
- Create: `apps/myk9show/src/store/__tests__/announcementStore.test.ts`

**Reference pattern:** `apps/myk9show/src/store/toastStore.ts` — lean Zustand, `create<Type>()(set => ({ ... }))`.

- [ ] **Step 1: Write the store**

```typescript
import { create } from 'zustand';
import { supabase } from '@/services/database/supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type {
  ShowAnnouncement,
  DbShowAnnouncement,
  CreateAnnouncementInput,
  UpdateAnnouncementInput,
  AnnouncementAuthorRole,
} from '@/types/announcement-types';
import {
  fetchShowAnnouncements,
  createAnnouncement as createAnnouncementQuery,
  updateAnnouncement as updateAnnouncementQuery,
  deleteAnnouncement as deleteAnnouncementQuery,
  markAnnouncementRead,
  markAllAnnouncementsRead,
} from '@/services/database/queries/announcementQueries';
import { useToastStore } from '@/store/toastStore';
import { logger } from '@/services/LoggingService';

interface AnnouncementState {
  announcements: ShowAnnouncement[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  currentShowIds: string[];
  channels: RealtimeChannel[];

  subscribe: (showIds: string[]) => Promise<void>;
  unsubscribe: () => void;
  createAnnouncement: (
    input: CreateAnnouncementInput,
    authorId: string,
    authorRole: AnnouncementAuthorRole,
    authorName: string
  ) => Promise<void>;
  updateAnnouncement: (id: string, updates: UpdateAnnouncementInput) => Promise<void>;
  deleteAnnouncement: (id: string) => Promise<void>;
  markRead: (id: string, userId: string) => Promise<void>;
  markAllRead: (userId: string) => Promise<void>;
}

function computeUnreadCount(announcements: ShowAnnouncement[]): number {
  return announcements.filter(a => !a.is_read).length;
}

export const useAnnouncementStore = create<AnnouncementState>()((set, get) => ({
  announcements: [],
  unreadCount: 0,
  isLoading: false,
  error: null,
  currentShowIds: [],
  channels: [],

  subscribe: async (showIds: string[]) => {
    const current = get();

    // Skip if already subscribed to the same shows
    const sorted = [...showIds].sort();
    const currentSorted = [...current.currentShowIds].sort();
    if (JSON.stringify(sorted) === JSON.stringify(currentSorted)) return;

    // Clean up existing channels
    current.unsubscribe();

    if (showIds.length === 0) {
      set({ currentShowIds: [], announcements: [], unreadCount: 0 });
      return;
    }

    set({ isLoading: true, error: null, currentShowIds: showIds });

    try {
      // Fetch announcements for all shows
      const results = await Promise.all(showIds.map(fetchShowAnnouncements));
      const all = results
        .flat()
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      set({ announcements: all, unreadCount: computeUnreadCount(all), isLoading: false });

      // Set up realtime channels
      const channels: RealtimeChannel[] = [];
      for (const showId of showIds) {
        const channel = supabase
          .channel(`announcements-${showId}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'show_announcements',
              filter: `show_id=eq.${showId}`,
            },
            payload => {
              const newAnn: ShowAnnouncement = {
                ...(payload.new as DbShowAnnouncement),
                is_read: false,
              };
              set(state => {
                const updated = [newAnn, ...state.announcements];
                return { announcements: updated, unreadCount: computeUnreadCount(updated) };
              });

              // Trigger toast for high/urgent announcements (per spec: realtime flow step 4)
              if (newAnn.priority === 'high' || newAnn.priority === 'urgent') {
                useToastStore.getState().addToast({
                  id: `ann-${newAnn.id}`,
                  type: 'announcement',
                  title: newAnn.title,
                  body: newAnn.content,
                  priority: newAnn.priority,
                  timestamp: Date.now(),
                });
              }
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'show_announcements',
              filter: `show_id=eq.${showId}`,
            },
            payload => {
              set(state => {
                const updated = state.announcements.map(a =>
                  a.id === (payload.new as DbShowAnnouncement).id
                    ? { ...a, ...(payload.new as DbShowAnnouncement) }
                    : a
                );
                return { announcements: updated, unreadCount: computeUnreadCount(updated) };
              });
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'DELETE',
              schema: 'public',
              table: 'show_announcements',
              filter: `show_id=eq.${showId}`,
            },
            payload => {
              const deletedId = (payload.old as { id: string }).id;
              set(state => {
                const updated = state.announcements.filter(a => a.id !== deletedId);
                return { announcements: updated, unreadCount: computeUnreadCount(updated) };
              });
            }
          );

        await channel.subscribe();
        channels.push(channel);
      }

      set({ channels });
    } catch (err) {
      logger.error('Failed to subscribe to announcements:', 'announcements', { data: err });
      set({
        error: err instanceof Error ? err.message : 'Failed to load announcements',
        isLoading: false,
      });
    }
  },

  unsubscribe: () => {
    const { channels } = get();
    for (const ch of channels) {
      supabase.removeChannel(ch);
    }
    set({ channels: [], currentShowIds: [] });
  },

  createAnnouncement: async (input, authorId, authorRole, authorName) => {
    // Optimistic add
    const tempId = crypto.randomUUID();
    const optimistic: ShowAnnouncement = {
      id: tempId,
      show_id: input.show_id,
      author_id: authorId,
      author_role: authorRole,
      author_name: authorName,
      title: input.title,
      content: input.content,
      priority: input.priority,
      expires_at: input.expires_at ?? null,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_read: true, // Author has already "read" their own
    };

    set(state => {
      const updated = [optimistic, ...state.announcements];
      return { announcements: updated, unreadCount: computeUnreadCount(updated) };
    });

    try {
      const created = await createAnnouncementQuery(input, authorId, authorRole, authorName);
      // Replace optimistic with real data (realtime may also fire — dedup by replacing temp)
      set(state => ({
        announcements: state.announcements.map(a =>
          a.id === tempId ? { ...created, is_read: true } : a
        ),
      }));
    } catch (err) {
      // Rollback optimistic
      set(state => {
        const updated = state.announcements.filter(a => a.id !== tempId);
        return { announcements: updated, unreadCount: computeUnreadCount(updated) };
      });
      throw err;
    }
  },

  updateAnnouncement: async (id, updates) => {
    // Optimistic update
    const prev = get().announcements.find(a => a.id === id);
    if (!prev) return;

    set(state => ({
      announcements: state.announcements.map(a => (a.id === id ? { ...a, ...updates } : a)),
    }));

    try {
      await updateAnnouncementQuery(id, updates);
    } catch (err) {
      // Rollback
      set(state => ({
        announcements: state.announcements.map(a => (a.id === id ? prev : a)),
      }));
      throw err;
    }
  },

  deleteAnnouncement: async id => {
    const prev = get().announcements;

    set(state => {
      const updated = state.announcements.filter(a => a.id !== id);
      return { announcements: updated, unreadCount: computeUnreadCount(updated) };
    });

    try {
      await deleteAnnouncementQuery(id);
    } catch (err) {
      set({ announcements: prev, unreadCount: computeUnreadCount(prev) });
      throw err;
    }
  },

  markRead: async (id, userId) => {
    set(state => {
      const updated = state.announcements.map(a => (a.id === id ? { ...a, is_read: true } : a));
      return { announcements: updated, unreadCount: computeUnreadCount(updated) };
    });

    try {
      await markAnnouncementRead(id, userId);
    } catch (err) {
      logger.error('Failed to mark announcement read:', 'announcements', { data: err });
    }
  },

  markAllRead: async userId => {
    const unreadIds = get()
      .announcements.filter(a => !a.is_read)
      .map(a => a.id);
    if (unreadIds.length === 0) return;

    set(state => ({
      announcements: state.announcements.map(a => ({ ...a, is_read: true })),
      unreadCount: 0,
    }));

    try {
      await markAllAnnouncementsRead(unreadIds, userId);
    } catch (err) {
      logger.error('Failed to mark all announcements read:', 'announcements', { data: err });
    }
  },
}));
```

- [ ] **Step 2: Write store tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAnnouncementStore } from '../announcementStore';
import type { ShowAnnouncement } from '@/types/announcement-types';

// Mock query functions
vi.mock('@/services/database/queries/announcementQueries', () => ({
  fetchShowAnnouncements: vi.fn(),
  createAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(),
  deleteAnnouncement: vi.fn(),
  markAnnouncementRead: vi.fn(),
  markAllAnnouncementsRead: vi.fn(),
}));

// Mock supabase for realtime
const mockSubscribe = vi.fn().mockResolvedValue(undefined);
const mockChannel = vi.fn().mockReturnValue({
  on: vi.fn().mockReturnThis(),
  subscribe: mockSubscribe,
});
const mockRemoveChannel = vi.fn();

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    channel: (...args: unknown[]) => mockChannel(...args),
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
  },
}));

vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), debug: vi.fn() },
}));

const { fetchShowAnnouncements, createAnnouncement: createQuery } =
  await import('@/services/database/queries/announcementQueries');

function makeAnnouncement(overrides: Partial<ShowAnnouncement> = {}): ShowAnnouncement {
  return {
    id: 'ann-1',
    show_id: 'show-1',
    author_id: 'user-1',
    author_role: 'secretary',
    author_name: 'Test User',
    title: 'Test',
    content: 'Content',
    priority: 'normal',
    expires_at: null,
    is_active: true,
    created_at: '2026-03-10T10:00:00Z',
    updated_at: '2026-03-10T10:00:00Z',
    is_read: false,
    ...overrides,
  };
}

describe('announcementStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state
    useAnnouncementStore.setState({
      announcements: [],
      unreadCount: 0,
      isLoading: false,
      error: null,
      currentShowIds: [],
      channels: [],
    });
  });

  describe('subscribe', () => {
    it('fetches announcements and sets up realtime channels', async () => {
      const ann = makeAnnouncement();
      vi.mocked(fetchShowAnnouncements).mockResolvedValue([ann]);

      await useAnnouncementStore.getState().subscribe(['show-1']);

      const state = useAnnouncementStore.getState();
      expect(state.announcements).toHaveLength(1);
      expect(state.unreadCount).toBe(1);
      expect(state.currentShowIds).toEqual(['show-1']);
      expect(mockChannel).toHaveBeenCalledWith('announcements-show-1');
    });

    it('skips if already subscribed to same shows', async () => {
      useAnnouncementStore.setState({ currentShowIds: ['show-1'] });
      await useAnnouncementStore.getState().subscribe(['show-1']);
      expect(fetchShowAnnouncements).not.toHaveBeenCalled();
    });

    it('clears state when subscribing to empty shows', async () => {
      useAnnouncementStore.setState({
        announcements: [makeAnnouncement()],
        unreadCount: 1,
        currentShowIds: ['show-1'],
      });

      await useAnnouncementStore.getState().subscribe([]);

      const state = useAnnouncementStore.getState();
      expect(state.announcements).toEqual([]);
      expect(state.unreadCount).toBe(0);
    });

    it('sets error on fetch failure', async () => {
      vi.mocked(fetchShowAnnouncements).mockRejectedValue(new Error('Network error'));

      await useAnnouncementStore.getState().subscribe(['show-1']);

      expect(useAnnouncementStore.getState().error).toBe('Network error');
    });
  });

  describe('createAnnouncement', () => {
    it('optimistically adds and then replaces with server data', async () => {
      const created = makeAnnouncement({ id: 'server-id', title: 'From Server' });
      vi.mocked(createQuery).mockResolvedValue(created);

      await useAnnouncementStore
        .getState()
        .createAnnouncement(
          { show_id: 'show-1', title: 'New', content: 'Body', priority: 'normal' },
          'user-1',
          'secretary',
          'Jane'
        );

      const state = useAnnouncementStore.getState();
      expect(state.announcements).toHaveLength(1);
      expect(state.announcements[0].id).toBe('server-id');
    });

    it('rolls back on failure', async () => {
      vi.mocked(createQuery).mockRejectedValue(new Error('Insert failed'));

      await expect(
        useAnnouncementStore
          .getState()
          .createAnnouncement(
            { show_id: 'show-1', title: 'New', content: 'Body', priority: 'normal' },
            'user-1',
            'secretary',
            'Jane'
          )
      ).rejects.toThrow('Insert failed');

      expect(useAnnouncementStore.getState().announcements).toHaveLength(0);
    });
  });

  describe('deleteAnnouncement', () => {
    it('optimistically removes the announcement', async () => {
      const { deleteAnnouncement: deleteMock } =
        await import('@/services/database/queries/announcementQueries');
      vi.mocked(deleteMock).mockResolvedValue(undefined);
      useAnnouncementStore.setState({
        announcements: [makeAnnouncement()],
        unreadCount: 1,
      });

      await useAnnouncementStore.getState().deleteAnnouncement('ann-1');

      expect(useAnnouncementStore.getState().announcements).toHaveLength(0);
      expect(useAnnouncementStore.getState().unreadCount).toBe(0);
    });
  });

  describe('markRead', () => {
    it('marks a single announcement as read', async () => {
      useAnnouncementStore.setState({
        announcements: [makeAnnouncement({ is_read: false })],
        unreadCount: 1,
      });

      await useAnnouncementStore.getState().markRead('ann-1', 'user-1');

      const state = useAnnouncementStore.getState();
      expect(state.announcements[0].is_read).toBe(true);
      expect(state.unreadCount).toBe(0);
    });
  });

  describe('markAllRead', () => {
    it('marks all announcements as read', async () => {
      useAnnouncementStore.setState({
        announcements: [
          makeAnnouncement({ id: 'a1', is_read: false }),
          makeAnnouncement({ id: 'a2', is_read: false }),
        ],
        unreadCount: 2,
      });

      await useAnnouncementStore.getState().markAllRead('user-1');

      const state = useAnnouncementStore.getState();
      expect(state.announcements.every(a => a.is_read)).toBe(true);
      expect(state.unreadCount).toBe(0);
    });

    it('skips when no unread announcements', async () => {
      const { markAllAnnouncementsRead } =
        await import('@/services/database/queries/announcementQueries');
      useAnnouncementStore.setState({
        announcements: [makeAnnouncement({ is_read: true })],
        unreadCount: 0,
      });

      await useAnnouncementStore.getState().markAllRead('user-1');
      expect(markAllAnnouncementsRead).not.toHaveBeenCalled();
    });
  });

  describe('unsubscribe', () => {
    it('removes all channels and clears show IDs', () => {
      const fakeChannel = { topic: 'test' };
      useAnnouncementStore.setState({
        channels: [fakeChannel as never],
        currentShowIds: ['show-1'],
      });

      useAnnouncementStore.getState().unsubscribe();

      expect(mockRemoveChannel).toHaveBeenCalledWith(fakeChannel);
      expect(useAnnouncementStore.getState().currentShowIds).toEqual([]);
      expect(useAnnouncementStore.getState().channels).toEqual([]);
    });
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd apps/myk9show && pnpm vitest run src/store/__tests__/announcementStore.test.ts`
Expected: All tests PASS.

- [ ] **Step 4: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/store/announcementStore.ts \
       apps/myk9show/src/store/__tests__/announcementStore.test.ts
git commit -m "feat(store): add announcement Zustand store with realtime and tests"
```

---

## Chunk 3: Subscription Hook + UI Components

### Task 5: Create subscription lifecycle hook

**Files:**

- Create: `apps/myk9show/src/hooks/useAnnouncementSubscription.ts`
- Modify: `apps/myk9show/src/App.tsx`

This hook manages the store's `subscribe`/`unsubscribe` lifecycle. **Must be mounted inside `AuthProvider`** (in `App.tsx`, not `main.tsx`) because it calls `useAuthContext()`.

- [ ] **Step 1: Write the subscription hook**

```typescript
import { useEffect } from 'react';
import { useAnnouncementStore } from '@/store/announcementStore';
import { useAuthContext } from '@/hooks/useAuthContext';

/**
 * Manages announcement store subscription lifecycle.
 * Reads active show IDs from the user's RBAC scopes and subscribes to realtime.
 * Mount once inside AuthProvider tree (App.tsx, not main.tsx — needs useAuthContext).
 */
export function useAnnouncementSubscription() {
  const { userWithRoles } = useAuthContext();
  const subscribe = useAnnouncementStore(s => s.subscribe);
  const unsubscribe = useAnnouncementStore(s => s.unsubscribe);

  useEffect(() => {
    if (!userWithRoles) {
      unsubscribe();
      return;
    }

    // Extract show IDs from user's role scopes
    // Officials have scopes with scopeType 'club' — we need show IDs
    // For now, we use the shows the user is associated with via the show store
    // This will be refined when show-day detection feeds show IDs
    const showScopes = (userWithRoles.scopes ?? [])
      .filter(s => s.scopeType === 'show')
      .map(s => s.scopeId);

    // Also include club-scoped roles — we'll need to resolve these to show IDs
    // For MVP: subscribe to show-scoped roles only
    // Club-scoped officials will see announcements when they select a show in Mission Control
    if (showScopes.length > 0) {
      subscribe(showScopes);
    }

    return () => {
      unsubscribe();
    };
  }, [userWithRoles, subscribe, unsubscribe]);
}
```

- [ ] **Step 2: Mount in App.tsx (inside AuthProvider)**

In `apps/myk9show/src/App.tsx`, import and call the hook inside a component that is a child of `AuthProvider`. Add the hook call inside the main app component, after `UserDataInitializer` or similar initialization hooks:

Add import:

```typescript
import { useAnnouncementSubscription } from '@/hooks/useAnnouncementSubscription';
```

Call the hook inside the component body (alongside other initialization hooks):

```typescript
useAnnouncementSubscription();
```

**Do NOT mount in `main.tsx`** — `main.tsx` renders `<ToastContainer />` and `<NotificationCenter />` outside `<App />`, which is outside `AuthProvider`. The hook needs `useAuthContext()` which requires `AuthProvider` as an ancestor.

- [ ] **Step 4: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/hooks/useAnnouncementSubscription.ts \
       apps/myk9show/src/App.tsx
git commit -m "feat(hooks): add announcement subscription lifecycle hook"
```

### Task 6: Create AnnouncementItem component

**Files:**

- Create: `apps/myk9show/src/components/announcements/AnnouncementItem.tsx`
- Create: `apps/myk9show/src/components/announcements/__tests__/AnnouncementItem.test.tsx`

Shared component used by both NotificationCenter and AnnouncementsCard.

- [ ] **Step 1: Write the component**

```typescript
import { Megaphone, AlertCircle, AlertTriangle, Inbox, Pencil, Trash2 } from 'lucide-react';
import type { ShowAnnouncement, AnnouncementPriority } from '@/types/announcement-types';
import { formatRelativeTime } from '@/lib/timeUtils';
import { PRIORITY_BORDER } from '@/components/notifications/notification-styles';

const PRIORITY_ICON: Record<AnnouncementPriority, { icon: typeof Megaphone; className: string }> = {
  urgent: { icon: AlertCircle, className: 'bg-red-500/15 text-red-400' },
  high: { icon: AlertTriangle, className: 'bg-amber-500/15 text-amber-400' },
  normal: { icon: Megaphone, className: 'bg-purple-500/15 text-purple-400' },
};

const ROLE_LABELS: Record<string, string> = {
  secretary: 'Secretary',
  judge: 'Judge',
  club_admin: 'Club Admin',
};

interface AnnouncementItemProps {
  announcement: ShowAnnouncement;
  onMarkRead?: (id: string) => void;
  onEdit?: (announcement: ShowAnnouncement) => void;
  onDelete?: (id: string) => void;
  showActions?: boolean;
}

export function AnnouncementItem({
  announcement,
  onMarkRead,
  onEdit,
  onDelete,
  showActions = false,
}: AnnouncementItemProps) {
  const { icon: Icon, className: iconClass } = PRIORITY_ICON[announcement.priority];

  const handleClick = () => {
    if (!announcement.is_read && onMarkRead) {
      onMarkRead(announcement.id);
    }
  };

  return (
    <div
      className={`border-b border-border/50 border-l-[3px] p-3.5 transition-opacity ${
        PRIORITY_BORDER[announcement.priority]
      } ${announcement.is_read ? 'opacity-50' : 'bg-muted/5'}`}
      onClick={handleClick}
      role="article"
      aria-label={announcement.title}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${iconClass}`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-tight">{announcement.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{announcement.content}</p>
          <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
            <span>{announcement.author_name ?? 'Unknown'}</span>
            <span>&middot;</span>
            <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-medium">
              {ROLE_LABELS[announcement.author_role] ?? announcement.author_role}
            </span>
            <span>&middot;</span>
            <span>{formatRelativeTime(new Date(announcement.created_at))}</span>
          </div>
        </div>
        {showActions && (onEdit || onDelete) && (
          <div className="flex items-center gap-1">
            {onEdit && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  onEdit(announcement);
                }}
                aria-label="Edit announcement"
                className="rounded p-1 text-muted-foreground/40 hover:bg-muted hover:text-foreground"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  onDelete(announcement.id);
                }}
                aria-label="Delete announcement"
                className="rounded p-1 text-muted-foreground/40 hover:bg-muted hover:text-red-400"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write tests**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AnnouncementItem } from '../AnnouncementItem';
import type { ShowAnnouncement } from '@/types/announcement-types';

function makeAnnouncement(overrides: Partial<ShowAnnouncement> = {}): ShowAnnouncement {
  return {
    id: 'ann-1',
    show_id: 'show-1',
    author_id: 'user-1',
    author_role: 'secretary',
    author_name: 'Jane Doe',
    title: 'Gate 3 Moved',
    content: 'Gate 3 has been moved to Ring B',
    priority: 'normal',
    expires_at: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_read: false,
    ...overrides,
  };
}

describe('AnnouncementItem', () => {
  it('renders title, content, author, and role badge', () => {
    render(<AnnouncementItem announcement={makeAnnouncement()} />);

    expect(screen.getByText('Gate 3 Moved')).toBeInTheDocument();
    expect(screen.getByText('Gate 3 has been moved to Ring B')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('Secretary')).toBeInTheDocument();
  });

  it('applies reduced opacity when read', () => {
    const { container } = render(
      <AnnouncementItem announcement={makeAnnouncement({ is_read: true })} />
    );
    expect(container.firstChild).toHaveClass('opacity-50');
  });

  it('calls onMarkRead when clicked and unread', () => {
    const onMarkRead = vi.fn();
    render(<AnnouncementItem announcement={makeAnnouncement()} onMarkRead={onMarkRead} />);

    fireEvent.click(screen.getByRole('article'));
    expect(onMarkRead).toHaveBeenCalledWith('ann-1');
  });

  it('does not call onMarkRead when already read', () => {
    const onMarkRead = vi.fn();
    render(
      <AnnouncementItem
        announcement={makeAnnouncement({ is_read: true })}
        onMarkRead={onMarkRead}
      />
    );

    fireEvent.click(screen.getByRole('article'));
    expect(onMarkRead).not.toHaveBeenCalled();
  });

  it('shows edit/delete buttons when showActions is true', () => {
    render(
      <AnnouncementItem
        announcement={makeAnnouncement()}
        showActions
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Edit announcement')).toBeInTheDocument();
    expect(screen.getByLabelText('Delete announcement')).toBeInTheDocument();
  });

  it('hides edit/delete buttons by default', () => {
    render(<AnnouncementItem announcement={makeAnnouncement()} />);

    expect(screen.queryByLabelText('Edit announcement')).not.toBeInTheDocument();
  });

  it('calls onDelete with announcement id', () => {
    const onDelete = vi.fn();
    render(
      <AnnouncementItem announcement={makeAnnouncement()} showActions onDelete={onDelete} />
    );

    fireEvent.click(screen.getByLabelText('Delete announcement'));
    expect(onDelete).toHaveBeenCalledWith('ann-1');
  });

  it('renders urgent priority with red styling', () => {
    render(<AnnouncementItem announcement={makeAnnouncement({ priority: 'urgent' })} />);
    // The border class is applied to the outer div
    const article = screen.getByRole('article');
    expect(article).toHaveClass('border-l-red-500');
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd apps/myk9show && pnpm vitest run src/components/announcements/__tests__/AnnouncementItem.test.tsx`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/announcements/AnnouncementItem.tsx \
       apps/myk9show/src/components/announcements/__tests__/AnnouncementItem.test.tsx
git commit -m "feat(ui): add AnnouncementItem component with tests"
```

### Task 7: Create CreateAnnouncementDialog

**Files:**

- Create: `apps/myk9show/src/components/announcements/CreateAnnouncementDialog.tsx`
- Create: `apps/myk9show/src/components/announcements/__tests__/CreateAnnouncementDialog.test.tsx`

**Note:** Edit mode (pre-populating the form with existing announcement data) is deferred. The dialog is create-only for now. The `editingAnnouncement` state in `AnnouncementsCard` opens the same create dialog — adding an `initialData` prop for edit mode can be done as a follow-up.

- [ ] **Step 1: Write the dialog component**

```typescript
import { useState } from 'react';
import { X, Megaphone, AlertTriangle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAnnouncementStore } from '@/store/announcementStore';
import { notifications } from '@/lib/notifications';
import type { AnnouncementPriority, AnnouncementAuthorRole } from '@/types/announcement-types';

const PRIORITY_OPTIONS: {
  value: AnnouncementPriority;
  label: string;
  icon: typeof Megaphone;
  className: string;
}[] = [
  { value: 'normal', label: 'Normal', icon: Megaphone, className: 'border-purple-500/30 text-purple-400' },
  { value: 'high', label: 'High', icon: AlertTriangle, className: 'border-amber-500/30 text-amber-400' },
  { value: 'urgent', label: 'Urgent', icon: AlertCircle, className: 'border-red-500/30 text-red-400' },
];

interface CreateAnnouncementDialogProps {
  isOpen: boolean;
  onClose: () => void;
  showId: string;
  showEndDate?: string | null;
  authorId: string;
  authorRole: AnnouncementAuthorRole;
  authorName: string;
}

export function CreateAnnouncementDialog({
  isOpen,
  onClose,
  showId,
  showEndDate,
  authorId,
  authorRole,
  authorName,
}: CreateAnnouncementDialogProps) {
  const createAnnouncement = useAnnouncementStore(s => s.createAnnouncement);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<AnnouncementPriority>('normal');
  const [expiresAt, setExpiresAt] = useState(showEndDate?.slice(0, 16) ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setTitle('');
    setContent('');
    setPriority('normal');
    setExpiresAt(showEndDate?.slice(0, 16) ?? '');
    setIsSubmitting(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setIsSubmitting(true);
    try {
      await createAnnouncement(
        {
          show_id: showId,
          title: title.trim(),
          content: content.trim(),
          priority,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        },
        authorId,
        authorRole,
        authorName
      );
      notifications.success('Announcement posted');
      resetForm();
      onClose();
    } catch {
      notifications.error('Failed to post announcement');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Create Announcement"
        aria-modal="true"
        className="fixed inset-x-4 top-[10%] z-50 mx-auto max-w-lg rounded-xl border border-border/50 bg-popover p-6 shadow-2xl sm:inset-x-auto"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">New Announcement</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="ann-title">Title</Label>
            <Input
              id="ann-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g., Gate 3 moved to Ring B"
              required
              maxLength={200}
            />
          </div>

          <div>
            <Label htmlFor="ann-content">Message</Label>
            <Textarea
              id="ann-content"
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Details about the announcement..."
              required
              rows={3}
              maxLength={2000}
            />
          </div>

          <div>
            <Label>Priority</Label>
            <div className="mt-1.5 flex gap-2">
              {PRIORITY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPriority(opt.value)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-colors ${
                    priority === opt.value
                      ? `${opt.className} bg-muted/30`
                      : 'border-border/30 text-muted-foreground hover:border-border'
                  }`}
                  aria-pressed={priority === opt.value}
                >
                  <opt.icon className="h-3.5 w-3.5" />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="ann-expires">Expires at (optional)</Label>
            <Input
              id="ann-expires"
              type="datetime-local"
              value={expiresAt}
              onChange={e => setExpiresAt(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Defaults to show end date. Clear to keep indefinitely.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !title.trim() || !content.trim()}>
              {isSubmitting ? 'Posting...' : 'Post Announcement'}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Write tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateAnnouncementDialog } from '../CreateAnnouncementDialog';

// Mock store
const mockCreateAnnouncement = vi.fn();
vi.mock('@/store/announcementStore', () => ({
  useAnnouncementStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ createAnnouncement: mockCreateAnnouncement }),
}));

// Mock notifications
vi.mock('@/lib/notifications', () => ({
  notifications: { success: vi.fn(), error: vi.fn() },
}));

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  showId: 'show-1',
  showEndDate: '2026-03-15T17:00:00Z',
  authorId: 'user-1',
  authorRole: 'secretary' as const,
  authorName: 'Jane Doe',
};

describe('CreateAnnouncementDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAnnouncement.mockResolvedValue(undefined);
  });

  it('renders form fields when open', () => {
    render(<CreateAnnouncementDialog {...defaultProps} />);

    expect(screen.getByLabelText('Title')).toBeInTheDocument();
    expect(screen.getByLabelText('Message')).toBeInTheDocument();
    expect(screen.getByText('Normal')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('Urgent')).toBeInTheDocument();
  });

  it('returns null when not open', () => {
    const { container } = render(
      <CreateAnnouncementDialog {...defaultProps} isOpen={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('disables submit when title or content is empty', () => {
    render(<CreateAnnouncementDialog {...defaultProps} />);
    expect(screen.getByText('Post Announcement')).toBeDisabled();
  });

  it('submits the form with correct data', async () => {
    const user = userEvent.setup();
    render(<CreateAnnouncementDialog {...defaultProps} />);

    await user.type(screen.getByLabelText('Title'), 'Test Title');
    await user.type(screen.getByLabelText('Message'), 'Test content');
    await user.click(screen.getByText('Post Announcement'));

    await waitFor(() => {
      expect(mockCreateAnnouncement).toHaveBeenCalledWith(
        expect.objectContaining({
          show_id: 'show-1',
          title: 'Test Title',
          content: 'Test content',
          priority: 'normal',
        }),
        'user-1',
        'secretary',
        'Jane Doe'
      );
    });
  });

  it('allows changing priority', async () => {
    const user = userEvent.setup();
    render(<CreateAnnouncementDialog {...defaultProps} />);

    await user.click(screen.getByText('Urgent'));
    expect(screen.getByText('Urgent').closest('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onClose after successful submit', async () => {
    const user = userEvent.setup();
    render(<CreateAnnouncementDialog {...defaultProps} />);

    await user.type(screen.getByLabelText('Title'), 'Title');
    await user.type(screen.getByLabelText('Message'), 'Content');
    await user.click(screen.getByText('Post Announcement'));

    await waitFor(() => {
      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  it('shows error notification on failure', async () => {
    mockCreateAnnouncement.mockRejectedValue(new Error('fail'));
    const user = userEvent.setup();
    render(<CreateAnnouncementDialog {...defaultProps} />);

    await user.type(screen.getByLabelText('Title'), 'Title');
    await user.type(screen.getByLabelText('Message'), 'Content');
    await user.click(screen.getByText('Post Announcement'));

    const { notifications } = await import('@/lib/notifications');
    await waitFor(() => {
      expect(notifications.error).toHaveBeenCalledWith('Failed to post announcement');
    });
  });

  it('closes when Cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<CreateAnnouncementDialog {...defaultProps} />);

    await user.click(screen.getByText('Cancel'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd apps/myk9show && pnpm vitest run src/components/announcements/__tests__/CreateAnnouncementDialog.test.tsx`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/announcements/CreateAnnouncementDialog.tsx \
       apps/myk9show/src/components/announcements/__tests__/CreateAnnouncementDialog.test.tsx
git commit -m "feat(ui): add CreateAnnouncementDialog with validation and tests"
```

---

## Chunk 4: Mission Control Card + NotificationCenter/Bell Integration

### Task 8: Create AnnouncementsCard for Mission Control

**Files:**

- Create: `apps/myk9show/src/features/pipeline/components/AnnouncementsCard.tsx`
- Create: `apps/myk9show/src/features/pipeline/components/__tests__/AnnouncementsCard.test.tsx`
- Modify: `apps/myk9show/src/features/pipeline/components/PipelineDashboard.tsx`

- [ ] **Step 1: Write the AnnouncementsCard component**

```typescript
import { useState } from 'react';
import { Megaphone, Plus } from 'lucide-react';
import { useAnnouncementStore } from '@/store/announcementStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { AnnouncementItem } from '@/components/announcements/AnnouncementItem';
import { CreateAnnouncementDialog } from '@/components/announcements/CreateAnnouncementDialog';
import { Button } from '@/components/ui/button';
import { notifications } from '@/lib/notifications';
import { ANNOUNCEMENT_OFFICIAL_ROLES } from '@/types/announcement-types';
import type { AnnouncementAuthorRole, ShowAnnouncement } from '@/types/announcement-types';

interface AnnouncementsCardProps {
  showId: string;
  showEndDate?: string | null;
}

export function AnnouncementsCard({ showId, showEndDate }: AnnouncementsCardProps) {
  const announcements = useAnnouncementStore(s => s.announcements);
  const unreadCount = useAnnouncementStore(s => s.unreadCount);
  const markRead = useAnnouncementStore(s => s.markRead);
  const deleteAnnouncement = useAnnouncementStore(s => s.deleteAnnouncement);
  const { userWithRoles } = useAuthContext();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<ShowAnnouncement | null>(null);

  // Determine if user is an official who can create announcements
  // UserWithRoles.roles is UserRole[] (string enum values like 'secretary', 'judge', 'club_admin')
  const userRole = (userWithRoles?.roles ?? []).find(r =>
    (ANNOUNCEMENT_OFFICIAL_ROLES as readonly string[]).includes(r)
  );
  const isOfficial = !!userRole;
  const authorRole: AnnouncementAuthorRole = (userRole as AnnouncementAuthorRole) ?? 'secretary';
  const authorId = userWithRoles?.id ?? '';
  const authorName = userWithRoles?.name ?? userWithRoles?.email ?? 'Unknown';

  const showAnnouncements = announcements.filter(a => a.show_id === showId);

  const canEditOrDelete = (ann: ShowAnnouncement) =>
    ann.author_id === authorId || authorRole === 'secretary';

  const handleDelete = async (id: string) => {
    try {
      await deleteAnnouncement(id);
      notifications.success('Announcement deleted');
    } catch {
      notifications.error('Failed to delete announcement');
    }
  };

  return (
    <div className="rounded-xl border border-border/50 bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-purple-400" />
          <h3 className="text-sm font-semibold">Announcements</h3>
          {unreadCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-purple-500 px-1.5 text-[10px] font-bold text-white">
              {unreadCount}
            </span>
          )}
        </div>
        {isOfficial && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsCreateOpen(true)}
            className="h-7 gap-1 text-xs"
          >
            <Plus className="h-3 w-3" />
            New
          </Button>
        )}
      </div>

      {/* List */}
      <div className="max-h-64 overflow-y-auto">
        {showAnnouncements.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-center">
            <Megaphone className="mb-2 h-6 w-6 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">No announcements yet</p>
          </div>
        ) : (
          showAnnouncements.map(ann => (
            <AnnouncementItem
              key={ann.id}
              announcement={ann}
              onMarkRead={id => markRead(id, authorId)}
              onEdit={canEditOrDelete(ann) ? () => setEditingAnnouncement(ann) : undefined}
              onDelete={canEditOrDelete(ann) ? handleDelete : undefined}
              showActions={canEditOrDelete(ann)}
            />
          ))
        )}
      </div>

      {/* Create dialog */}
      <CreateAnnouncementDialog
        isOpen={isCreateOpen || !!editingAnnouncement}
        onClose={() => {
          setIsCreateOpen(false);
          setEditingAnnouncement(null);
        }}
        showId={showId}
        showEndDate={showEndDate}
        authorId={authorId}
        authorRole={authorRole}
        authorName={authorName}
      />
    </div>
  );
}
```

- [ ] **Step 2: Write tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AnnouncementsCard } from '../AnnouncementsCard';
import type { ShowAnnouncement } from '@/types/announcement-types';

// Mock stores
const mockAnnouncements: ShowAnnouncement[] = [];
const mockMarkRead = vi.fn();
const mockDeleteAnnouncement = vi.fn();

vi.mock('@/store/announcementStore', () => ({
  useAnnouncementStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      announcements: mockAnnouncements,
      unreadCount: mockAnnouncements.filter(a => !a.is_read).length,
      markRead: mockMarkRead,
      deleteAnnouncement: mockDeleteAnnouncement,
    }),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    userWithRoles: {
      id: 'user-1',
      name: 'Jane Doe',
      email: 'jane@test.com',
      roles: [{ role_name: 'secretary' }],
      scopes: [],
    },
  }),
}));

vi.mock('@/lib/notifications', () => ({
  notifications: { success: vi.fn(), error: vi.fn() },
}));

function makeAnnouncement(overrides: Partial<ShowAnnouncement> = {}): ShowAnnouncement {
  return {
    id: 'ann-1',
    show_id: 'show-1',
    author_id: 'user-1',
    author_role: 'secretary',
    author_name: 'Jane Doe',
    title: 'Test Announcement',
    content: 'Test content',
    priority: 'normal',
    expires_at: null,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_read: false,
    ...overrides,
  };
}

describe('AnnouncementsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAnnouncements.length = 0;
  });

  it('renders header with Announcements title', () => {
    render(<AnnouncementsCard showId="show-1" />);
    expect(screen.getByText('Announcements')).toBeInTheDocument();
  });

  it('shows empty state when no announcements', () => {
    render(<AnnouncementsCard showId="show-1" />);
    expect(screen.getByText('No announcements yet')).toBeInTheDocument();
  });

  it('renders announcements for the given show', () => {
    mockAnnouncements.push(makeAnnouncement());
    render(<AnnouncementsCard showId="show-1" />);
    expect(screen.getByText('Test Announcement')).toBeInTheDocument();
  });

  it('filters announcements to only the given show', () => {
    mockAnnouncements.push(makeAnnouncement({ show_id: 'other-show' }));
    render(<AnnouncementsCard showId="show-1" />);
    expect(screen.getByText('No announcements yet')).toBeInTheDocument();
  });

  it('shows New button for officials', () => {
    render(<AnnouncementsCard showId="show-1" />);
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('opens create dialog when New is clicked', () => {
    render(<AnnouncementsCard showId="show-1" />);
    fireEvent.click(screen.getByText('New'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows unread count badge', () => {
    mockAnnouncements.push(makeAnnouncement({ is_read: false }));
    render(<AnnouncementsCard showId="show-1" />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd apps/myk9show && pnpm vitest run src/features/pipeline/components/__tests__/AnnouncementsCard.test.tsx`
Expected: All tests PASS.

- [ ] **Step 4: Add AnnouncementsCard to PipelineDashboard**

In `apps/myk9show/src/features/pipeline/components/PipelineDashboard.tsx`:

Add import:

```typescript
import { AnnouncementsCard } from './AnnouncementsCard';
```

Add the card in the JSX, after the `<TrialContextRow>` and before the pipeline columns. The exact placement depends on the layout — add it above the drag-and-drop area:

```tsx
{
  selectedShow && <AnnouncementsCard showId={selectedShow.id} showEndDate={selectedShow.endDate} />;
}
```

- [ ] **Step 5: Run typecheck and full test suite**

Run: `cd apps/myk9show && pnpm typecheck && pnpm vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/features/pipeline/components/AnnouncementsCard.tsx \
       apps/myk9show/src/features/pipeline/components/__tests__/AnnouncementsCard.test.tsx \
       apps/myk9show/src/features/pipeline/components/PipelineDashboard.tsx
git commit -m "feat(pipeline): add AnnouncementsCard to Mission Control dashboard"
```

### Task 9: Integrate announcements into NotificationCenter

**Files:**

- Modify: `apps/myk9show/src/components/notifications/NotificationCenter.tsx`
- Modify: `apps/myk9show/src/components/notifications/__tests__/NotificationCenter.test.tsx`

The Announcements tab should read from `useAnnouncementStore` instead of filtering `notificationStore.recentAlerts`. The All tab merges both sources.

- [ ] **Step 1: Update NotificationCenter**

In `apps/myk9show/src/components/notifications/NotificationCenter.tsx`:

Add imports:

```typescript
import { useAnnouncementStore } from '@/store/announcementStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { AnnouncementItem } from '@/components/announcements/AnnouncementItem';
import { CreateAnnouncementDialog } from '@/components/announcements/CreateAnnouncementDialog';
import { ANNOUNCEMENT_OFFICIAL_ROLES } from '@/types/announcement-types';
import type { AnnouncementAuthorRole } from '@/types/announcement-types';
import { Plus } from 'lucide-react';
```

Key changes to the `NotificationCenter` component:

1. Read announcement data from `useAnnouncementStore`:

   ```typescript
   const storeAnnouncements = useAnnouncementStore(s => s.announcements);
   const announcementUnread = useAnnouncementStore(s => s.unreadCount);
   const annMarkRead = useAnnouncementStore(s => s.markRead);
   const annMarkAllRead = useAnnouncementStore(s => s.markAllRead);
   ```

2. Add state for create dialog:

   ```typescript
   const [isCreateOpen, setIsCreateOpen] = useState(false);
   ```

3. Get auth context for official check and author info:

   ```typescript
   const { userWithRoles } = useAuthContext();
   ```

4. Update `filteredAlerts` to handle the Announcements tab differently:
   - When `activeTab === 'announcements'`: render `storeAnnouncements` using `AnnouncementItem`
   - When `activeTab === 'dogs'`: filter `recentAlerts` as before
   - When `activeTab === 'all'`: merge both sources by timestamp

5. Update "Mark all read" to call both stores.

6. Add "+ New" button on Announcements tab for officials.

7. Add `<CreateAnnouncementDialog>` at the bottom.

The exact code changes depend on the current structure — the implementing agent should read the full file and make the minimal changes needed.

- [ ] **Step 2: Update existing NotificationCenter tests**

Add tests for:

- Announcements tab renders from announcement store
- All tab merges both sources
- Officials see "+ New" button on Announcements tab
- Mark all read calls both stores

- [ ] **Step 3: Run tests**

Run: `cd apps/myk9show && pnpm vitest run src/components/notifications/__tests__/NotificationCenter.test.tsx`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/notifications/NotificationCenter.tsx \
       apps/myk9show/src/components/notifications/__tests__/NotificationCenter.test.tsx
git commit -m "feat(notifications): integrate announcement store into NotificationCenter"
```

### Task 10: Update NotificationBell with combined unread count

**Files:**

- Modify: `apps/myk9show/src/components/notifications/NotificationBell.tsx`
- Modify: `apps/myk9show/src/components/notifications/__tests__/NotificationBell.test.tsx`

- [ ] **Step 1: Update NotificationBell**

In `apps/myk9show/src/components/notifications/NotificationBell.tsx`:

Add import:

```typescript
import { useAnnouncementStore } from '@/store/announcementStore';
```

Add selector:

```typescript
const announcementUnread = useAnnouncementStore(s => s.unreadCount);
```

Update unread badge to show combined count:

```typescript
const totalUnread = unreadCount + announcementUnread;
```

Replace `unreadCount` with `totalUnread` in the badge rendering:

```tsx
{
  totalUnread > 0 && (
    <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
      {totalUnread}
    </span>
  );
}
```

- [ ] **Step 2: Update NotificationBell tests**

Add a test that verifies the badge shows combined count from both stores.

- [ ] **Step 3: Run tests**

Run: `cd apps/myk9show && pnpm vitest run src/components/notifications/__tests__/NotificationBell.test.tsx`
Expected: All tests PASS.

- [ ] **Step 4: Run full typecheck and test suite**

Run: `cd apps/myk9show && pnpm typecheck && pnpm vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/notifications/NotificationBell.tsx \
       apps/myk9show/src/components/notifications/__tests__/NotificationBell.test.tsx
git commit -m "feat(notifications): combine announcement + alert unread counts in bell"
```

---

## Chunk 5: Final Integration + Quality Gates

### Task 11: Run full quality gates

- [ ] **Step 1: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS across entire monorepo.

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: PASS

- [ ] **Step 3: Run all myK9Show tests**

Run: `cd apps/myk9show && pnpm vitest run`
Expected: All tests PASS, including new announcement tests and existing notification tests.

- [ ] **Step 4: Run build**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 5: Fix any issues found, commit fixes**

### Task 12: Update TODO tracker

- [ ] **Step 1: Mark the TODO as complete in TO-DOS.md**

In `TO-DOS.md`, find the "Notification Inbox + System Announcements - 2026-03-09" section and mark the todo as complete with `[x]` and a summary of what was done.

- [ ] **Step 2: Commit**

```bash
git add TO-DOS.md
git commit -m "docs: mark notification inbox + announcements as complete"
```
