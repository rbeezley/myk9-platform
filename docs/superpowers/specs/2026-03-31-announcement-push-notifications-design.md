# Announcement Push Notifications — Design Spec

**Date:** 2026-03-31
**Status:** Approved

## Problem

Announcements are in-app only (Supabase Realtime + toast + bell badge). When the app is closed, users miss high/urgent announcements like "Ring 3 moved to Building B." The push notification infrastructure (service worker, `push_subscriptions` table, `send-push-notification` edge function, VAPID keys) already exists from the dog notification pipeline.

## Decision Summary

| Question            | Decision                                                               |
| ------------------- | ---------------------------------------------------------------------- |
| Audience resolution | Derive from existing data (entries + user_roles), no schema changes    |
| Trigger mechanism   | Database webhook on `show_announcements` INSERT                        |
| Normal priority     | In-app only, no push                                                   |
| Fan-out strategy    | Single edge function queries all users and sends directly via web-push |

## Design

### Trigger

Supabase database webhook on `show_announcements` INSERT fires a new edge function `push-trigger-announcement`.

### Priority Filter

The edge function checks the announcement's `priority` field:

- **high / urgent** — proceed with push delivery
- **normal** — exit early, no push sent (in-app Realtime handles it)

### Audience Resolution

Two queries, unioned and deduped:

1. **Exhibitors:** Users with dogs entered in the show.

   ```sql
   SELECT DISTINCT d.owner_id AS user_id
   FROM entries e
   JOIN dogs d ON e.dog_id = d.id
   WHERE e.show_id = :show_id
   ```

2. **Officials:** Users with roles scoped to the show.
   ```sql
   SELECT DISTINCT ur.user_id
   FROM user_roles ur
   WHERE ur.scope_type = 'show' AND ur.scope_id = :show_id
   ```

The `author_id` is excluded from the final set (don't push the person who created the announcement).

### Push Delivery

Single edge function invocation:

1. Parse webhook payload, extract announcement record
2. Check priority — exit early if `normal`
3. Query audience (exhibitors ∪ officials − author)
4. Batch-fetch all `push_subscriptions` for those user IDs
5. Loop through subscriptions, send via `web-push` library with VAPID keys
6. Auto-delete expired endpoints on 410/404 responses (matches existing pattern in `send-push-notification`)

### Payload

```typescript
{
  type: 'announcement',
  title: announcement.title,
  body: truncate(announcement.content, 200),
  priority: announcement.priority,
  actionUrl: `/shows/${announcement.show_id}`,
  timestamp: Date.now(),
  data: {
    announcementId: announcement.id,
    showId: announcement.show_id,
    authorRole: announcement.author_role,
  }
}
```

The payload is constructed inline in the edge function (same pattern as `push-trigger-class-status` and `push-trigger-scoring`). The `buildAnnouncementPayload()` helper in `@myk9/notifications` is a client-side TS package and cannot be imported from the Deno edge function.

### Service Worker

No changes needed. `sw-custom.ts` already handles generic push payloads with `title`, `body`, `icon`, and `actionUrl` navigation on click.

### Client-Side

No changes needed. The existing in-app path (Realtime subscription → toast for high/urgent) continues to work. Push is purely server-side additive.

## Files

| Action | File                                                    | Notes                                                                        |
| ------ | ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Create | `supabase/functions/push-trigger-announcement/index.ts` | New edge function, modeled on `push-trigger-class-status`                    |
| Config | Supabase webhook                                        | INSERT on `show_announcements` → `push-trigger-announcement`                 |
| Test   | Edge function tests                                     | Unit tests for priority filtering, audience resolution, payload construction |

## Non-Goals

- Per-show push subscription opt-in (users can't selectively mute shows)
- Push for normal-priority announcements
- Client-side changes to announcement creation or display
- Changes to the service worker
