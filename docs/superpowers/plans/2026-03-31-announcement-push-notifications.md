# Announcement Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send push notifications to show participants when a secretary/judge/club admin creates a high or urgent announcement.

**Architecture:** A new Supabase edge function (`push-trigger-announcement`) is triggered by a database webhook on `show_announcements` INSERT. It filters by priority (skips normal), resolves the audience (exhibitors + officials for the show, minus the author), fetches their push subscriptions, and sends via `web-push` with VAPID keys. No client-side or service worker changes needed.

**Tech Stack:** Deno (Supabase Edge Functions), `@supabase/supabase-js@2`, `web-push@3`, Supabase database webhooks

**Spec:** `docs/superpowers/specs/2026-03-31-announcement-push-notifications-design.md`

---

## File Map

| Action | File                                                    | Responsibility                                                                                        |
| ------ | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Create | `supabase/functions/push-trigger-announcement/index.ts` | Edge function: parse webhook, filter priority, resolve audience, send push, cleanup expired endpoints |
| Create | `supabase/migrations/101_announcement_push_webhook.sql` | SQL migration to register the webhook trigger (pg_net HTTP call on INSERT)                            |

---

## Schema Notes (Critical for Implementation)

The join paths are non-obvious:

- **Exhibitors:** `entries.dog_id → dogs.owner_id → people.auth_user_id` (auth UUID)
- **Officials:** `user_roles.user_id → people.auth_user_id` (auth UUID)
- `user_roles` uses `show_id` column directly, NOT `scope_type`/`scope_id` (those are computed in RBAC functions)
- `push_subscriptions.user_id` stores `auth.users.id` (auth UUID)
- The existing `push-trigger-class-status` uses `entries.user_id` which does NOT exist on the entries table — this is a latent bug in that function. Our implementation must use the correct join path above.

---

### Task 1: Create the Edge Function

**Files:**

- Create: `supabase/functions/push-trigger-announcement/index.ts`

- [ ] **Step 1: Create the edge function file with webhook payload parsing and priority filter**

```typescript
// supabase/functions/push-trigger-announcement/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

interface AnnouncementRecord {
  id: string;
  show_id: string;
  author_id: string;
  author_role: string;
  title: string;
  content: string;
  priority: 'normal' | 'high' | 'urgent';
}

interface WebhookPayload {
  type: 'INSERT';
  table: 'show_announcements';
  record: AnnouncementRecord;
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!;
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!;
const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:support@myk9show.com';

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '…';
}

Deno.serve(async (req: Request) => {
  try {
    const payload: WebhookPayload = await req.json();
    const announcement = payload.record;

    // Only push for high/urgent — normal is in-app only
    if (announcement.priority === 'normal') {
      return new Response('Normal priority — no push needed', { status: 200 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // --- Audience Resolution ---

    // 1. Exhibitors: entries → dogs (owner_id) → people (auth_user_id)
    const { data: exhibitors } = await supabase
      .from('entries')
      .select('dog:dogs(owner:people!owner_id(auth_user_id))')
      .eq('show_id', announcement.show_id);

    const exhibitorUserIds = new Set<string>();
    if (exhibitors) {
      for (const entry of exhibitors) {
        const authUserId = entry.dog?.owner?.auth_user_id;
        if (authUserId) exhibitorUserIds.add(authUserId);
      }
    }

    // 2. Officials: user_roles (show_id) → people (auth_user_id)
    const { data: officials } = await supabase
      .from('user_roles')
      .select('person:people!user_id(auth_user_id)')
      .eq('show_id', announcement.show_id);

    const officialUserIds = new Set<string>();
    if (officials) {
      for (const role of officials) {
        const authUserId = role.person?.auth_user_id;
        if (authUserId) officialUserIds.add(authUserId);
      }
    }

    // Union and exclude the author
    const allUserIds = [...new Set([...exhibitorUserIds, ...officialUserIds])].filter(
      id => id !== announcement.author_id
    );

    if (allUserIds.length === 0) {
      return new Response('No users to notify', { status: 200 });
    }

    // --- Fetch Push Subscriptions ---
    const { data: subscriptions, error: subError } = await supabase
      .from('push_subscriptions')
      .select('user_id, endpoint, keys')
      .in('user_id', allUserIds);

    if (subError) throw subError;
    if (!subscriptions?.length) {
      return new Response('No push subscriptions found', { status: 200 });
    }

    // --- Build Payload ---
    const pushPayload = JSON.stringify({
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
      },
    });

    // --- Send Push Notifications ---
    let sent = 0;
    const expiredEndpoints: { user_id: string; endpoint: string }[] = [];

    await Promise.allSettled(
      subscriptions.map(async sub => {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, pushPayload);
          sent++;
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 410 || statusCode === 404) {
            expiredEndpoints.push({ user_id: sub.user_id, endpoint: sub.endpoint });
          }
          console.error(`Push failed for ${sub.endpoint}:`, (err as Error).message);
        }
      })
    );

    // --- Cleanup Expired Subscriptions ---
    if (expiredEndpoints.length > 0) {
      // Delete each expired subscription individually (user_id + endpoint is the unique key)
      await Promise.allSettled(
        expiredEndpoints.map(({ user_id, endpoint }) =>
          supabase
            .from('push_subscriptions')
            .delete()
            .eq('user_id', user_id)
            .eq('endpoint', endpoint)
        )
      );
    }

    return new Response(
      JSON.stringify({
        sent,
        total_subscriptions: subscriptions.length,
        expired: expiredEndpoints.length,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('push-trigger-announcement error:', error);
    return new Response('Error', { status: 500 });
  }
});
```

- [ ] **Step 2: Verify the function file exists and has no syntax issues**

Run: `deno check --no-lock supabase/functions/push-trigger-announcement/index.ts 2>&1 || echo "Deno check not available — visual review only"`

Note: Deno type checking may not be configured locally. At minimum, visually confirm the file was written correctly by reading it back.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/push-trigger-announcement/index.ts
git commit -m "feat: add push-trigger-announcement edge function

Sends web-push notifications to show participants (exhibitors + officials)
when a high or urgent announcement is created. Normal priority announcements
remain in-app only. Resolves audience via entries→dogs→people and
user_roles→people join paths. Auto-cleans expired push subscriptions."
```

---

### Task 2: Create the Database Webhook Migration

The webhook must fire the edge function on every INSERT into `show_announcements`. Supabase database webhooks can be created via `pg_net` (for self-hosted) or the Supabase Dashboard (for hosted). Since migrations run via `supabase db push`, we use a `pg_net` HTTP trigger.

**Files:**

- Create: `supabase/migrations/101_announcement_push_webhook.sql`

- [ ] **Step 1: Determine next migration number**

Run: `ls supabase/migrations/ | tail -5`

Use the next number after the highest existing migration. The plan assumes `101` — adjust if needed.

- [ ] **Step 2: Create the webhook migration**

```sql
-- Push notification webhook for high/urgent announcements
-- Fires push-trigger-announcement edge function on show_announcements INSERT

-- Create the trigger function that calls the edge function via pg_net
CREATE OR REPLACE FUNCTION notify_announcement_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only fire for high/urgent priority (normal = in-app only)
  IF NEW.priority IN ('high', 'urgent') THEN
    PERFORM net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/push-trigger-announcement',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := jsonb_build_object(
        'type', 'INSERT',
        'table', 'show_announcements',
        'record', jsonb_build_object(
          'id', NEW.id,
          'show_id', NEW.show_id,
          'author_id', NEW.author_id,
          'author_role', NEW.author_role,
          'title', NEW.title,
          'content', NEW.content,
          'priority', NEW.priority
        )
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Attach trigger to show_announcements table
DROP TRIGGER IF EXISTS on_announcement_insert_push ON show_announcements;
CREATE TRIGGER on_announcement_insert_push
  AFTER INSERT ON show_announcements
  FOR EACH ROW
  EXECUTE FUNCTION notify_announcement_push();
```

**Important:** This migration uses `pg_net` extension (`net.http_post`). Supabase hosted projects have `pg_net` enabled by default. The `app.settings.supabase_url` and `app.settings.service_role_key` are set by Supabase automatically in hosted environments.

If the hosted Supabase project does NOT have `app.settings` configured, you'll need to use the Supabase Dashboard to create the webhook instead (Dashboard → Database → Webhooks → New Webhook). In that case, this migration should be a comment-only file documenting the manual webhook setup.

- [ ] **Step 3: Verify migration file**

Run: `cat supabase/migrations/101_announcement_push_webhook.sql`

Confirm the SQL is syntactically correct and the trigger name, table name, and function name are all consistent.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/101_announcement_push_webhook.sql
git commit -m "feat: add database trigger for announcement push notifications

Creates notify_announcement_push() trigger function that fires on
show_announcements INSERT. Only calls the edge function for high/urgent
priority announcements. Uses pg_net to invoke push-trigger-announcement."
```

---

### Task 3: Deploy and Test

- [ ] **Step 1: Deploy the edge function**

Run: `supabase functions deploy push-trigger-announcement --no-verify-jwt`

The `--no-verify-jwt` flag is required because this function is called by the database trigger (pg_net), not by an authenticated user. Same pattern as the other push trigger functions.

- [ ] **Step 2: Push the migration**

Run: `supabase db push`

This applies the webhook migration to the hosted database.

- [ ] **Step 3: Verify the trigger exists**

Run via Supabase SQL Editor or `psql`:

```sql
SELECT tgname, tgtype, tgenabled
FROM pg_trigger
WHERE tgname = 'on_announcement_insert_push';
```

Expected: One row with `tgenabled = 'O'` (Origin, meaning enabled).

- [ ] **Step 4: End-to-end test**

1. Open myK9Show in a browser, log in as an exhibitor with entries in a show
2. Ensure push notifications are enabled (Settings → Notifications → Push toggle ON)
3. Close the browser tab (or navigate away so the app is in background)
4. In a separate browser/incognito, log in as a secretary for that show
5. Create a **high** priority announcement: "Test push notification"
6. Verify the exhibitor's device receives a push notification with the announcement title and content
7. Click the notification — verify it navigates to `/shows/{show_id}`

- [ ] **Step 5: Test normal priority does NOT push**

1. Same setup as above
2. Create a **normal** priority announcement
3. Verify NO push notification is received
4. Open the app — verify the announcement appears in-app via Realtime (toast should NOT fire for normal)

- [ ] **Step 6: Verify edge function logs**

Run: `supabase functions logs push-trigger-announcement --limit 20`

Check for:

- Successful sends (JSON response with `sent` count)
- Any errors (expired endpoints being cleaned up is expected, other errors need investigation)

---

## Verification Checklist

- [ ] Edge function deployed and responding
- [ ] Database trigger fires on INSERT to `show_announcements`
- [ ] Normal priority announcements do NOT trigger push
- [ ] High/urgent announcements trigger push to exhibitors and officials
- [ ] Author does NOT receive their own announcement as a push
- [ ] Expired push subscriptions are cleaned up automatically
- [ ] Clicking the push notification navigates to the show page
- [ ] In-app Realtime path continues to work (toast for high/urgent, silent for normal)
