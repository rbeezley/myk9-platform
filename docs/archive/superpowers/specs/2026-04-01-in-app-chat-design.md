# In-App Chat: Exhibitor ↔ Secretary Messaging

**Date:** 2026-04-01
**Status:** Draft
**App:** myK9Show

## Overview

Real-time private messaging between show participants and the trial secretary, scoped per-show. Allows exhibitors, judges, stewards, and other roles to ask questions or receive information from the secretary without leaving the app. Secretaries can also send targeted group messages to all exhibitors in a specific class.

## Goals

- Give exhibitors a direct channel to the trial secretary ("Can I move my run?", "Where do I check in?")
- Give secretaries a way to contact individual exhibitors ("Your paperwork is missing") or groups ("Class 4 is delayed 15 minutes")
- Reuse existing infrastructure (Supabase Realtime, web-push, Zustand patterns) for zero incremental cost

## Non-Goals

- Group chat rooms (announcements already cover broadcast)
- Cross-show message history (each show is a clean slate)
- AI integration with AskQ (separate feature, can unify entry point later)
- Typing indicators, delivery receipts, read receipts displayed to sender
- Moderation tools (tight-knit in-person community; add later if needed)

## Design Decisions

| Decision              | Choice                                         | Rationale                                                                       |
| --------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------- |
| Communication pattern | 1-on-1 threads + targeted group messages       | Private threads for individual questions; group messages for class-wide updates |
| Initiation            | Both directions                                | Exhibitors can start conversations; secretaries can reach out                   |
| Group message replies | Go to private 1-on-1 thread                    | Avoids noisy group threads; secretary sees reply in context                     |
| Show scoping          | Per-show only                                  | Matches existing data model; keeps it simple                                    |
| Realtime approach     | `postgres_changes` (Approach 1)                | Proven pattern in codebase (announcements, check-in, notification monitor)      |
| Notifications         | Badge + push + in-app toast                    | Full stack reusing existing infra                                               |
| UI placement          | Nav item (not floating button)                 | Floating button overlaps content on mobile; nav is cleaner and consistent       |
| Secretary inbox       | Shared inbox (all secretaries see all threads) | Small teams (1-2), avoids routing complexity                                    |
| Site admin access     | Inbox view (same as secretary)                 | Consistent with existing admin access patterns                                  |
| Moderation            | None in v1                                     | YAGNI for in-person dog show community                                          |
| Relationship to AskQ  | Separate features                              | Avoids coupling; can unify entry point later                                    |

## Data Model

### `show_message_threads`

One thread per non-secretary participant per show. Created on first message (from either side).

| Column            | Type        | Constraints                     | Notes                                                    |
| ----------------- | ----------- | ------------------------------- | -------------------------------------------------------- |
| `id`              | uuid        | PK, default `gen_random_uuid()` |                                                          |
| `show_id`         | uuid        | FK → shows, NOT NULL            | Scopes thread to a show                                  |
| `participant_id`  | uuid        | FK → auth.users, NOT NULL       | The non-secretary user (exhibitor, judge, steward, etc.) |
| `last_message_at` | timestamptz | NOT NULL                        | For sorting inbox; updated on each new message           |
| `created_at`      | timestamptz | NOT NULL, default `now()`       |                                                          |

**Unique constraint:** `(show_id, participant_id)` — one thread per participant per show.

**Indexes:**

- `(show_id, last_message_at DESC)` — secretary inbox sorted by recency

### `show_messages`

Individual messages within a thread.

| Column        | Type        | Constraints                         | Notes                                                                          |
| ------------- | ----------- | ----------------------------------- | ------------------------------------------------------------------------------ |
| `id`          | uuid        | PK, default `gen_random_uuid()`     |                                                                                |
| `show_id`     | uuid        | FK → shows, NOT NULL                | Denormalized for RLS efficiency                                                |
| `thread_id`   | uuid        | FK → show_message_threads, NOT NULL |                                                                                |
| `sender_id`   | uuid        | FK → auth.users, NOT NULL           |                                                                                |
| `body`        | text        | NOT NULL, CHECK length > 0          | Message content                                                                |
| `group_label` | text        | nullable                            | e.g., "Sent to all Class 4 exhibitors" — display context for targeted messages |
| `read_at`     | timestamptz | nullable                            | NULL = unread; set when recipient opens thread                                 |
| `created_at`  | timestamptz | NOT NULL, default `now()`           |                                                                                |

**Indexes:**

- `(thread_id, created_at)` — message list in chronological order
- `(show_id, sender_id, read_at)` — unread count queries

### RLS Policies

**`show_message_threads`:**

- **SELECT:** Participants can see their own threads (`participant_id = auth.uid()`). Secretaries and site admins can see all threads for shows they're assigned to (via `is_trial_secretary(show_id)` or `is_site_admin()`).
- **INSERT:** Any authenticated show participant (user with an entry or a role assignment for the show) can create a thread for themselves. Secretaries can create threads for any participant in their show.

**`show_messages`:**

- **SELECT:** Users can see messages in threads they have access to (same logic as thread SELECT).
- **INSERT:** Users can insert messages into threads they have access to. `sender_id` must match `auth.uid()`.

### Targeted Group Messages

When a secretary sends a targeted message (e.g., to all Class 4 exhibitors):

1. Query all exhibitors entered in the selected class.
2. For each exhibitor, find or create their `show_message_threads` row.
3. Insert a `show_messages` row into each thread with the same `body` and a `group_label` (e.g., "Sent to all Class 4 exhibitors").
4. Each exhibitor sees it as a normal message in their private thread, with the group label for context.
5. Push notification sent to each recipient.

This is handled by an edge function (`send-targeted-message`) for atomicity — avoids partial sends if the secretary's browser closes mid-fan-out.

## Realtime & Notifications

### Realtime Subscription

Follows the `useAnnouncementStore` pattern:

- `useMessageStore` (Zustand) subscribes to `postgres_changes` on `show_messages` filtered by `show_id`.
- On INSERT: append message to the correct thread in local state, update unread count, update `last_message_at` on the thread.
- Channel name: `messages:${showId}`

### Unread Tracking

- `read_at` on `show_messages` starts as NULL.
- When user opens a thread, batch-update all unread messages in that thread: `SET read_at = now() WHERE thread_id = ? AND read_at IS NULL AND sender_id != auth.uid()`.
- Unread count derived from `read_at IS NULL AND sender_id != current_user` across all threads for the show.
- Badge on nav item shows total unread count.

### In-App Toast

New message while app is open triggers a Sonner toast:

- Shows sender name and message preview (truncated).
- Tapping opens the conversation.
- Same pattern as high-priority announcement toasts.

### Push Notification

- Database trigger on `show_messages` INSERT fires `push-trigger-chat-message` edge function via `pg_net`.
- Edge function looks up recipient's `push_subscriptions`, sends web-push with sender name, message preview, and `actionUrl` pointing to the conversation.
- Service worker `notificationclick` navigates to the actionUrl (existing pattern in `sw-custom.ts`).
- If the app is in the foreground and shows the toast, the service worker suppresses the duplicate push (existing dedup pattern from notification monitor).

## UI Components

### All Roles

- **"Messages" nav item** in the bottom tab bar (mobile) and sidebar (desktop) with unread count badge.
- Sender name + role badge (Secretary, Exhibitor, Judge, etc.) + timestamp on each message bubble.

### Non-Secretary Roles (Exhibitor, Judge, Steward, Club Admin, Chairman)

- **Full-screen chat view** when tapping "Messages."
- Shows their single thread for the current show.
- Message list (chronological, scrolled to bottom) + text input at bottom.
- **Show context:** If the user is entered in multiple shows, the chat view is scoped to the currently-selected show (same show context used by announcements and other show-scoped features).
- **Empty state:** "Start a conversation with the trial secretary" with a text input ready to go.
- Group messages from the secretary show the `group_label` as a subtle annotation.

### Secretary / Site Admin

- **`/secretary/messages` page** in the secretary sidebar.
- **Desktop:** Two-panel layout — thread list (left) sorted by `last_message_at` with unread indicators and participant name/role, active conversation (right).
- **Mobile:** Thread list view; tap a thread to open the conversation full-screen with back navigation.
- **Unread badge** on the "Messages" sidebar nav item.
- **"Message class" button** on the class details page — opens a compose modal with pre-filled recipient scope ("Class 4 — 12 exhibitors") and text input.
- **"New targeted message" button** on the messages page — class picker dropdown → compose modal (same as above).
- **Group message indicator** in thread view — targeted messages show the `group_label` (e.g., "Sent to all Class 4 exhibitors").

## Cost Analysis

**Incremental cost: ~$0** on the existing Supabase Pro plan.

- **Realtime:** Already using `postgres_changes` extensively. Chat adds more channels but Pro includes 500 concurrent connections and unlimited messages. A show with 50-200 participants is well within limits.
- **Database:** Chat messages are tiny text rows. Negligible storage impact.
- **Push notifications:** Reuses existing `push_subscriptions` table, VAPID keys, and edge function patterns. No third-party push service.
- **Edge Functions:** Pro includes 2M invocations/month. A `push-trigger-chat-message` function adds minimal invocations.

## Testing Strategy

- **Unit tests:** Zustand store (message append, unread count, read marking), RLS policy tests (participant isolation, secretary access), targeted message fan-out logic.
- **Integration tests:** Realtime subscription receives new messages, push trigger fires on insert, unread badge updates on message arrival and thread open.
- **E2E tests:** Exhibitor sends message → secretary sees it in inbox. Secretary replies → exhibitor sees it. Secretary sends targeted class message → each exhibitor receives it in their thread.

## File Structure (Estimated)

```
supabase/migrations/
  NNN_show_messages.sql              # Tables, RLS, indexes, trigger

supabase/functions/
  push-trigger-chat-message/
    index.ts                          # Push notification on new message

apps/myk9show/src/
  store/messageStore.ts               # Zustand store + realtime subscription
  hooks/queries/useMessages.ts        # React Query hooks for initial load
  hooks/mutations/useMessageMutations.ts  # Send message, mark read, targeted send
  features/messages/
    components/
      ChatView.tsx                    # Single-thread view (non-secretary)
      MessageBubble.tsx               # Individual message display
      MessageInput.tsx                # Text input + send button
      ThreadList.tsx                  # Secretary inbox thread list
      ThreadListItem.tsx              # Single thread preview
      ComposeTargetedModal.tsx        # Class picker + compose for group messages
    pages/
      SecretaryMessagesPage.tsx       # /secretary/messages route
      ChatPage.tsx                    # Non-secretary full-screen chat
```
