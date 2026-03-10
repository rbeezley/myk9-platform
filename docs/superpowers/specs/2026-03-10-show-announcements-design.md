# Show Announcements — Design Spec

> **Status:** Approved
> **Date:** 2026-03-10
> **TODO ref:** "Build notification inbox with system announcements" (2026-03-09)

## Goal

Complete the notification inbox feature by adding show-scoped announcements with persistent storage, admin CRUD, and realtime delivery. The inbox UI (NotificationCenter, ToastContainer, NotificationBell) already exists — this spec covers the backend, data layer, and UI integration.

## Design Decisions

| Decision           | Choice                                               | Rationale                                                                     |
| ------------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| Announcement scope | Per-show (`show_id`)                                 | Users at different concurrent shows should not see each other's announcements |
| Who can create     | Secretary, judge, steward, club_admin                | All show officials may need to communicate                                    |
| Create UI location | Mission Control + NotificationCenter quick-compose   | Full management on dashboard, quick access in inbox                           |
| Expiry behavior    | Optional per-announcement, defaults to show end date | Covers transient ("gate moved") and persistent ("results posted") use cases   |
| Data persistence   | Supabase table, not ephemeral                        | Announcements survive page refresh; historical record after show              |

## Database Schema

### Migration `057_announcements.sql`

**`show_announcements` table:**

```sql
CREATE TABLE show_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES people(id),
  author_role TEXT NOT NULL CHECK (author_role IN ('secretary', 'judge', 'steward', 'club_admin')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'high', 'urgent')),
  expires_at TIMESTAMPTZ,  -- defaults to show end date (set by app layer)
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**`show_announcement_reads` table:**

```sql
CREATE TABLE show_announcement_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES show_announcements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(announcement_id, user_id)
);
```

**Indexes:**

- `show_announcements(show_id, created_at DESC)` — fetch by show, newest first
- `show_announcements(expires_at)` — filter expired
- `show_announcement_reads(user_id, announcement_id)` — lookup read status

**RLS policies:**

- SELECT on `show_announcements`: authenticated users (filter to relevant shows in app layer)
- INSERT/UPDATE/DELETE on `show_announcements`: show officials only (secretary, judge, steward, club_admin for that show's club) — enforced via `is_show_official(show_id)` helper or app-layer check
- SELECT on `show_announcement_reads`: own reads only (`user_id = auth.uid()`)
- INSERT on `show_announcement_reads`: own reads only

**Trigger:** `update_updated_at_column()` on `show_announcements` before UPDATE.

**Realtime:** `ALTER PUBLICATION supabase_realtime ADD TABLE show_announcements;`

## Data Layer

### `announcementQueries.ts`

Supabase query functions:

- `fetchShowAnnouncements(showId: string)` — SELECT with LEFT JOIN on reads for current user's `is_read` status. Filters: `is_active = true`, `expires_at > now() OR expires_at IS NULL`.
- `createAnnouncement(data)` — INSERT with `.select()` to return created row.
- `updateAnnouncement(id, updates)` — partial UPDATE (title, content, priority, expires_at, is_active).
- `deleteAnnouncement(id)` — DELETE.
- `markAnnouncementRead(announcementId)` — UPSERT into `show_announcement_reads`.
- `markAllAnnouncementsRead(showId)` — batch UPSERT for all unread announcements in show.

### `useAnnouncementStore` (Zustand)

Lean store (~150-200 lines). No license_key management, no service worker push, no offline-first (unlike myK9Q's 658-line version).

**State:**

```typescript
interface AnnouncementState {
  announcements: ShowAnnouncement[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  currentShowIds: string[];
}
```

**Actions:**

- `subscribe(showIds: string[])` — fetch announcements + open realtime channels
- `unsubscribe()` — close realtime channels
- `createAnnouncement(data)` — optimistic add + DB insert
- `updateAnnouncement(id, updates)` — optimistic update + DB update
- `deleteAnnouncement(id)` — optimistic remove + DB delete
- `markRead(id)` / `markAllRead(showId)` — optimistic + DB upsert

**Realtime:** One channel per subscribed show_id, listening for INSERT/UPDATE/DELETE on `show_announcements`.

### React Query Hooks

- `useShowAnnouncements(showId)` — initial fetch, cache key `['announcements', showId]`
- `useCreateAnnouncement()` — mutation with optimistic cache update
- `useUpdateAnnouncement()` / `useDeleteAnnouncement()` — mutations
- `useMarkAnnouncementRead()` — mutation

Store handles realtime pushes; React Query handles initial fetch + cache. Store is the source of truth once subscribed.

## UI Components

### Mission Control — `AnnouncementsCard`

- New card on PipelineDashboard for show officials
- Lists recent announcements: priority badge, title, author (name + role badge), relative time
- Unread count badge on card header
- "New Announcement" button → opens `CreateAnnouncementDialog`
- Inline edit/delete actions for author or secretary

### `CreateAnnouncementDialog`

- Fields: title (input), content (textarea), priority (normal/high/urgent radio cards), expiry (datetime picker, defaults to show end date, clearable)
- Author auto-populated from current user + role context
- Shared between Mission Control and NotificationCenter quick-compose
- Validates: title required, content required

### NotificationCenter Changes

- **Announcements tab:** data source switches from `notificationStore.recentAlerts` filtered by `type === 'announcement'` to `announcementStore.announcements`
- **Dogs tab:** stays on `notificationStore.recentAlerts` (ephemeral alerts)
- **All tab:** merges both sources, sorted by timestamp
- Officials see a compact "+ New" button at top of Announcements tab → opens `CreateAnnouncementDialog`
- Announcement items display: author name, role badge, priority indicator, relative time, show name
- Mark read on click/view; bulk mark-all-read works across both stores

### NotificationBell Changes

- Unread count = `notificationStore.unreadCount` + `announcementStore.unreadCount`
- Preview dropdown interleaves both sources sorted by timestamp
- Announcement items in preview show a Megaphone icon prefix

### Authorization in UI

- All show participants see announcements in inbox
- Only officials (secretary, judge, steward, club_admin for that show) see compose buttons
- Only the author or a secretary can edit/delete an announcement
- Role check uses existing RBAC context (`useAuth` / `userWithRoles`)

## Show Scoping & Lifecycle

### How users get scoped

- `useShowDayData` already detects active shows for exhibitors — same show IDs feed into `announcementStore.subscribe()`
- Officials scoped via role assignments (secretary of show X, judge for show X)
- Multi-show users: announcements labeled with show name, grouped or interleaved

### Announcement lifecycle

- Announcements with `expires_at` in the past: hidden from inbox (still in DB)
- Default expiry = show end date (set by app layer on create, not DB default)
- `is_active = false`: soft-hidden by author/secretary (can reactivate)
- No background cleanup job — filter on fetch
- Historical data remains in DB for potential admin queries

### Realtime flow

1. Official creates announcement → Supabase INSERT
2. Realtime channel pushes to all subscribers for that `show_id`
3. Store adds to local state, bumps unread count
4. ToastContainer shows a toast for `urgent` or `high` priority announcements (via existing `useNotificationDelivery` or direct toast store push)

## File Structure

| File                                                                      | Action    | Responsibility                             |
| ------------------------------------------------------------------------- | --------- | ------------------------------------------ |
| `supabase/migrations/057_announcements.sql`                               | Create    | DB schema, indexes, RLS, trigger, realtime |
| `apps/myk9show/src/types/announcement-types.ts`                           | Create    | TypeScript interfaces                      |
| `apps/myk9show/src/services/database/queries/announcementQueries.ts`      | Create    | Supabase CRUD functions                    |
| `apps/myk9show/src/store/announcementStore.ts`                            | Create    | Zustand store with realtime                |
| `apps/myk9show/src/hooks/queries/useAnnouncementHooks.ts`                 | Create    | React Query hooks                          |
| `apps/myk9show/src/components/announcements/CreateAnnouncementDialog.tsx` | Create    | Create/edit form dialog                    |
| `apps/myk9show/src/components/announcements/AnnouncementItem.tsx`         | Create    | Single announcement display                |
| `apps/myk9show/src/features/pipeline/components/AnnouncementsCard.tsx`    | Create    | Mission Control card                       |
| `apps/myk9show/src/components/notifications/NotificationCenter.tsx`       | Modify    | Announcements tab → store                  |
| `apps/myk9show/src/components/notifications/NotificationBell.tsx`         | Modify    | Combined unread count                      |
| `apps/myk9show/src/store/notificationStore.ts`                            | No change | Stays as ephemeral alert store             |

## Testing

- Unit tests for `announcementQueries` (mock Supabase client)
- Unit tests for `announcementStore` (actions, optimistic updates, realtime handlers)
- Unit tests for `CreateAnnouncementDialog` (validation, submit, role gating)
- Unit tests for `AnnouncementsCard` (render, CRUD actions, empty state)
- Unit tests for NotificationCenter changes (tab switching, merged data)
- Unit tests for NotificationBell changes (combined unread count)
