# In-App Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real-time private messaging between show participants and the trial secretary, with targeted group messaging to class exhibitors.

**Architecture:** Two Postgres tables (`show_message_threads`, `show_messages`) with RLS. Zustand store subscribes to `postgres_changes` for realtime updates. Two edge functions handle push notifications and targeted fan-out. Nav-based UI with a secretary inbox page and a non-secretary single-thread chat page.

**Tech Stack:** Supabase (Postgres, Realtime, Edge Functions, RLS), Zustand, React Query, shadcn/ui, Sonner toasts, web-push via existing VAPID infrastructure.

**Spec:** `docs/superpowers/specs/2026-04-01-in-app-chat-design.md`

---

## File Structure

### Database

- `supabase/migrations/105_show_messages.sql` — Tables, indexes, RLS policies, push trigger

### Edge Functions

- `supabase/functions/push-trigger-chat-message/index.ts` — Push notification on new message INSERT (fired by database trigger)
- `supabase/functions/send-targeted-message/index.ts` — Secretary sends a message to all exhibitors in a class (fan-out)

### Store & Hooks

- `apps/myk9show/src/store/messageStore.ts` — Zustand store with realtime subscription, data fetching with name enrichment (mirrors announcementStore pattern)
- `apps/myk9show/src/hooks/mutations/useMessageMutations.ts` — Send message, mark read, send targeted

### UI Components

- `apps/myk9show/src/features/messages/components/MessageBubble.tsx` — Single message display with sender name, role badge, timestamp
- `apps/myk9show/src/features/messages/components/MessageInput.tsx` — Text input + send button
- `apps/myk9show/src/features/messages/components/ThreadList.tsx` — Secretary inbox thread list
- `apps/myk9show/src/features/messages/components/ThreadListItem.tsx` — Single thread preview row
- `apps/myk9show/src/features/messages/components/ComposeTargetedModal.tsx` — Class picker + compose for targeted group messages

### Pages

- `apps/myk9show/src/features/messages/pages/SecretaryMessagesPage.tsx` — `/secretary/messages` inbox
- `apps/myk9show/src/features/messages/pages/ChatPage.tsx` — Non-secretary single-thread chat

### Route & Nav Integration

- Modify: `apps/myk9show/src/routes/secretaryRoutes.tsx` — Add secretary messages route
- Modify: `apps/myk9show/src/routes/publicRoutes.tsx` — Add exhibitor/general chat route
- Modify: `apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts` — Add Messages nav item

---

## Task 1: Database Migration

**Files:**

- Create: `supabase/migrations/105_show_messages.sql`

- [ ] **Step 1: Create the migration file with tables**

```sql
-- 105_show_messages.sql
-- In-app chat: exhibitor <-> trial secretary messaging

-- Thread per participant per show
CREATE TABLE show_message_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (show_id, participant_id)
);

CREATE INDEX idx_smt_show_last_msg ON show_message_threads (show_id, last_message_at DESC);

-- Individual messages
CREATE TABLE show_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES show_message_threads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id),
  body text NOT NULL CHECK (length(trim(body)) > 0),
  group_label text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sm_thread_created ON show_messages (thread_id, created_at);
CREATE INDEX idx_sm_show_unread ON show_messages (show_id, sender_id, read_at) WHERE read_at IS NULL;

-- Enable RLS
ALTER TABLE show_message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE show_messages ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS: show_message_threads
-- =============================================================================

-- Participants see their own threads; secretaries/admins see all threads for their shows
CREATE POLICY "threads_select" ON show_message_threads FOR SELECT TO authenticated
USING (
  participant_id = auth.uid()
  OR is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM shows s
    WHERE s.id = show_message_threads.show_id
    AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id))
  )
);

-- Participants create their own thread; secretaries create for any participant
CREATE POLICY "threads_insert" ON show_message_threads FOR INSERT TO authenticated
WITH CHECK (
  participant_id = auth.uid()
  OR is_platform_admin()
  OR EXISTS (
    SELECT 1 FROM shows s
    WHERE s.id = show_message_threads.show_id
    AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id))
  )
);

-- =============================================================================
-- RLS: show_messages
-- =============================================================================

-- Users see messages in threads they can access
CREATE POLICY "messages_select" ON show_messages FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM show_message_threads t
    WHERE t.id = show_messages.thread_id
    AND (
      t.participant_id = auth.uid()
      OR is_platform_admin()
      OR EXISTS (
        SELECT 1 FROM shows s
        WHERE s.id = t.show_id
        AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id))
      )
    )
  )
);

-- Users insert messages into threads they can access; sender_id must match auth.uid()
CREATE POLICY "messages_insert" ON show_messages FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM show_message_threads t
    WHERE t.id = show_messages.thread_id
    AND (
      t.participant_id = auth.uid()
      OR is_platform_admin()
      OR EXISTS (
        SELECT 1 FROM shows s
        WHERE s.id = t.show_id
        AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id))
      )
    )
  )
);

-- Users can mark messages as read in their threads
CREATE POLICY "messages_update_read" ON show_messages FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM show_message_threads t
    WHERE t.id = show_messages.thread_id
    AND (
      t.participant_id = auth.uid()
      OR is_platform_admin()
      OR EXISTS (
        SELECT 1 FROM shows s
        WHERE s.id = t.show_id
        AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id))
      )
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM show_message_threads t
    WHERE t.id = show_messages.thread_id
    AND (
      t.participant_id = auth.uid()
      OR is_platform_admin()
      OR EXISTS (
        SELECT 1 FROM shows s
        WHERE s.id = t.show_id
        AND (is_trial_secretary(s.club_id) OR is_club_admin(s.club_id))
      )
    )
  )
);

-- =============================================================================
-- Trigger: update last_message_at on new message
-- =============================================================================

CREATE OR REPLACE FUNCTION update_thread_last_message_at()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE show_message_threads
  SET last_message_at = NEW.created_at
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_update_thread_last_message
  AFTER INSERT ON show_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_thread_last_message_at();

-- =============================================================================
-- Trigger: push notification on new message via pg_net
-- =============================================================================

CREATE OR REPLACE FUNCTION notify_chat_message()
RETURNS TRIGGER AS $$
DECLARE
  edge_function_url text;
BEGIN
  edge_function_url := current_setting('app.settings.edge_function_base_url', true)
    || '/push-trigger-chat-message';

  PERFORM net.http_post(
    url := edge_function_url,
    body := jsonb_build_object(
      'record', jsonb_build_object(
        'id', NEW.id,
        'show_id', NEW.show_id,
        'thread_id', NEW.thread_id,
        'sender_id', NEW.sender_id,
        'body', NEW.body,
        'created_at', NEW.created_at
      )
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_chat_message
  AFTER INSERT ON show_messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_chat_message();

-- Enable realtime for messages table
ALTER PUBLICATION supabase_realtime ADD TABLE show_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE show_message_threads;
```

- [ ] **Step 2: Validate migration syntax**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && npx supabase db lint --level warning`

Expected: No errors related to migration 105.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/105_show_messages.sql
git commit -m "feat(chat): add show_message_threads and show_messages tables with RLS"
```

---

## Task 2: Push Trigger Edge Function

**Files:**

- Create: `supabase/functions/push-trigger-chat-message/index.ts`

**Reference:** `supabase/functions/push-trigger-announcement/index.ts` (same pattern)

- [ ] **Step 1: Create the edge function**

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

const CHUNK_SIZE = 100;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { record } = await req.json();
    const { id, show_id, thread_id, sender_id, body, created_at } = record;

    if (!id || !show_id || !thread_id || !sender_id || !body) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get the thread to find the recipient
    const { data: thread, error: threadError } = await supabase
      .from('show_message_threads')
      .select('participant_id, show_id')
      .eq('id', thread_id)
      .single();

    if (threadError || !thread) {
      return new Response(JSON.stringify({ error: 'Thread not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Determine recipients: if sender is participant, notify secretaries; if sender is secretary, notify participant
    let recipientUserIds: string[] = [];

    if (sender_id === thread.participant_id) {
      // Exhibitor sent message -> notify secretaries for this show
      const { data: show } = await supabase
        .from('shows')
        .select('club_id')
        .eq('id', show_id)
        .single();

      if (show) {
        const { data: secretaries } = await supabase
          .from('user_roles')
          .select('user_id, people!inner(auth_user_id)')
          .eq('club_id', show.club_id)
          .in('roles.name', ['secretary', 'trial_secretary'])
          .not('people.auth_user_id', 'is', null);

        // Also include platform admins
        const { data: admins } = await supabase
          .from('user_roles')
          .select('user_id, people!inner(auth_user_id), roles!inner(name)')
          .eq('roles.name', 'platform_admin')
          .not('people.auth_user_id', 'is', null);

        const allRecipients = [...(secretaries || []), ...(admins || [])];
        const authIds = allRecipients.map((r: any) => r.people?.auth_user_id).filter(Boolean);
        recipientUserIds = [...new Set(authIds)];
      }
    } else {
      // Secretary sent message -> notify the participant
      recipientUserIds = [thread.participant_id];
    }

    // Remove sender from recipients
    recipientUserIds = recipientUserIds.filter(uid => uid !== sender_id);

    if (recipientUserIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0, total_subscriptions: 0, expired: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get sender display name
    const { data: senderPerson } = await supabase
      .from('people')
      .select('first_name, last_name')
      .eq('auth_user_id', sender_id)
      .single();

    const senderName = senderPerson
      ? `${senderPerson.first_name} ${senderPerson.last_name}`.trim()
      : 'Someone';

    // Fetch push subscriptions in chunks
    const allSubscriptions: any[] = [];
    for (let i = 0; i < recipientUserIds.length; i += CHUNK_SIZE) {
      const chunk = recipientUserIds.slice(i, i + CHUNK_SIZE);
      const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('id, user_id, endpoint, keys')
        .in('user_id', chunk);
      if (subs) allSubscriptions.push(...subs);
    }

    if (allSubscriptions.length === 0) {
      return new Response(JSON.stringify({ sent: 0, total_subscriptions: 0, expired: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Configure web-push
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!;
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!;
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@myk9.app';

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    // Build push payload
    const truncatedBody = body.length > 100 ? body.substring(0, 97) + '...' : body;
    const payload = JSON.stringify({
      title: `Message from ${senderName}`,
      body: truncatedBody,
      data: {
        type: 'chat_message',
        messageId: id,
        threadId: thread_id,
        showId: show_id,
        actionUrl: `/messages/${show_id}`,
      },
    });

    // Send push notifications
    const expiredEndpointIds: string[] = [];
    let sentCount = 0;

    const results = await Promise.allSettled(
      allSubscriptions.map(async sub => {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload);
          sentCount++;
        } catch (err: any) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            expiredEndpointIds.push(sub.id);
          }
        }
      })
    );

    // Clean up expired subscriptions
    if (expiredEndpointIds.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', expiredEndpointIds);
    }

    return new Response(
      JSON.stringify({
        sent: sentCount,
        total_subscriptions: allSubscriptions.length,
        expired: expiredEndpointIds.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/push-trigger-chat-message/
git commit -m "feat(chat): add push-trigger-chat-message edge function"
```

---

## Task 3: Send Targeted Message Edge Function

**Files:**

- Create: `supabase/functions/send-targeted-message/index.ts`

This edge function handles the targeted message fan-out: secretary picks a class, the function creates/finds threads for each exhibitor and inserts a message into each.

- [ ] **Step 1: Create the edge function**

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Authenticate the caller
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify caller identity with their JWT
    const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await callerClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { show_id, class_id, body } = await req.json();

    if (!show_id || !class_id || !body?.trim()) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: show_id, class_id, body' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Use service role client for data operations (bypasses RLS)
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is secretary/admin for this show
    const { data: show } = await supabase
      .from('shows')
      .select('id, club_id')
      .eq('id', show_id)
      .single();

    if (!show) {
      return new Response(JSON.stringify({ error: 'Show not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check caller has secretary or admin role
    const { data: callerRoles } = await supabase
      .from('user_roles')
      .select('roles!inner(name)')
      .eq('people.auth_user_id', user.id)
      .or(
        `and(roles.name.in.(secretary,trial_secretary),club_id.eq.${show.club_id}),roles.name.eq.platform_admin`
      );

    if (!callerRoles || callerRoles.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: secretary or admin role required' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get class info for group label
    const { data: classInfo } = await supabase
      .from('classes')
      .select('class_number, class_name')
      .eq('id', class_id)
      .single();

    // Get all exhibitors in this class via entries -> dogs -> people -> auth_user_id
    const { data: entries } = await supabase
      .from('entries')
      .select('dog:dogs(owner:people(auth_user_id))')
      .eq('class_id', class_id)
      .is('deleted_at', null);

    if (!entries || entries.length === 0) {
      return new Response(JSON.stringify({ error: 'No entries found for class', sent_to: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract unique auth_user_ids, exclude the sender
    const recipientIds = [
      ...new Set(
        entries
          .map((e: any) => e.dog?.owner?.auth_user_id)
          .filter((uid: string | null) => uid && uid !== user.id)
      ),
    ] as string[];

    if (recipientIds.length === 0) {
      return new Response(JSON.stringify({ sent_to: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const classLabel = classInfo
      ? `Sent to all Class ${classInfo.class_number} (${classInfo.class_name}) exhibitors`
      : `Sent to all class exhibitors`;

    // [EXPANDED] Batch upsert threads, then batch insert messages (avoids N+1)
    const now = new Date().toISOString();

    // Step 1: Batch upsert all threads
    const threadUpserts = recipientIds.map(recipientId => ({
      show_id,
      participant_id: recipientId,
      last_message_at: now,
    }));

    const { data: upsertedThreads, error: upsertError } = await supabase
      .from('show_message_threads')
      .upsert(threadUpserts, { onConflict: 'show_id,participant_id' })
      .select('id, participant_id');

    if (upsertError || !upsertedThreads) {
      return new Response(
        JSON.stringify({ error: 'Failed to create threads', details: upsertError?.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Batch insert messages into all threads
    const messageInserts = upsertedThreads.map(thread => ({
      show_id,
      thread_id: thread.id,
      sender_id: user.id,
      body: body.trim(),
      group_label: classLabel,
    }));

    const { data: insertedMessages, error: insertError } = await supabase
      .from('show_messages')
      .insert(messageInserts)
      .select('id');

    const sentCount = insertError ? 0 : (insertedMessages?.length ?? 0);

    return new Response(
      JSON.stringify({
        sent_to: sentCount,
        total_recipients: recipientIds.length,
        group_label: classLabel,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/send-targeted-message/
git commit -m "feat(chat): add send-targeted-message edge function for class fan-out"
```

---

## Task 4: TypeScript Types

**Files:**

- Create: `apps/myk9show/src/features/messages/types.ts`

- [ ] **Step 1: Define types**

```typescript
export interface MessageThread {
  id: string;
  show_id: string;
  participant_id: string;
  last_message_at: string;
  created_at: string;
  // Joined fields
  participant_name?: string;
  participant_role?: string;
  show_name?: string;
  unread_count?: number;
  last_message_preview?: string;
}

export interface Message {
  id: string;
  show_id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  group_label: string | null;
  read_at: string | null;
  created_at: string;
  // Joined fields
  sender_name?: string;
  sender_role?: string;
}

export interface SendMessageParams {
  showId: string;
  threadId: string;
  body: string;
}

export interface SendTargetedMessageParams {
  showId: string;
  classId: string;
  body: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/myk9show/src/features/messages/types.ts
git commit -m "feat(chat): add message type definitions"
```

---

## Task 5: Message Store (Zustand + Realtime)

**Files:**

- Create: `apps/myk9show/src/store/messageStore.ts`
- Test: `apps/myk9show/src/store/__tests__/messageStore.test.ts`

**Reference:** `apps/myk9show/src/store/announcementStore.ts` (same pattern)

- [ ] **Step 1: Write tests for the message store**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useMessageStore } from '../messageStore';

// Mock Supabase
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn(),
    })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnValue({ status: 'SUBSCRIBED' }),
    })),
    removeChannel: vi.fn(),
    functions: {
      invoke: vi.fn(),
    },
  },
}));

describe('messageStore', () => {
  beforeEach(() => {
    useMessageStore.getState().reset();
  });

  describe('initial state', () => {
    it('starts with empty threads and messages', () => {
      const state = useMessageStore.getState();
      expect(state.threads).toEqual([]);
      expect(state.messagesByThread).toEqual({});
      expect(state.unreadCount).toBe(0);
      expect(state.isLoading).toBe(false);
    });
  });

  describe('addMessage', () => {
    it('appends a message to the correct thread', () => {
      const { addMessage } = useMessageStore.getState();
      const msg = {
        id: 'msg-1',
        show_id: 'show-1',
        thread_id: 'thread-1',
        sender_id: 'user-2',
        body: 'Hello',
        group_label: null,
        read_at: null,
        created_at: new Date().toISOString(),
      };

      addMessage(msg);

      const state = useMessageStore.getState();
      expect(state.messagesByThread['thread-1']).toHaveLength(1);
      expect(state.messagesByThread['thread-1'][0].body).toBe('Hello');
    });

    it('does not add duplicate messages', () => {
      const { addMessage } = useMessageStore.getState();
      const msg = {
        id: 'msg-1',
        show_id: 'show-1',
        thread_id: 'thread-1',
        sender_id: 'user-2',
        body: 'Hello',
        group_label: null,
        read_at: null,
        created_at: new Date().toISOString(),
      };

      addMessage(msg);
      addMessage(msg);

      const state = useMessageStore.getState();
      expect(state.messagesByThread['thread-1']).toHaveLength(1);
    });

    it('increments unread count for messages from others', () => {
      const { addMessage, setCurrentUserId } = useMessageStore.getState();
      setCurrentUserId('user-1');

      addMessage({
        id: 'msg-1',
        show_id: 'show-1',
        thread_id: 'thread-1',
        sender_id: 'user-2',
        body: 'Hello',
        group_label: null,
        read_at: null,
        created_at: new Date().toISOString(),
      });

      expect(useMessageStore.getState().unreadCount).toBe(1);
    });

    it('does not increment unread for own messages', () => {
      const { addMessage, setCurrentUserId } = useMessageStore.getState();
      setCurrentUserId('user-1');

      addMessage({
        id: 'msg-1',
        show_id: 'show-1',
        thread_id: 'thread-1',
        sender_id: 'user-1',
        body: 'My message',
        group_label: null,
        read_at: null,
        created_at: new Date().toISOString(),
      });

      expect(useMessageStore.getState().unreadCount).toBe(0);
    });
  });

  describe('markThreadRead', () => {
    it('sets read_at on all unread messages in thread and decrements unread count', () => {
      const { addMessage, markThreadRead, setCurrentUserId } = useMessageStore.getState();
      setCurrentUserId('user-1');

      addMessage({
        id: 'msg-1',
        show_id: 'show-1',
        thread_id: 'thread-1',
        sender_id: 'user-2',
        body: 'Hello',
        group_label: null,
        read_at: null,
        created_at: new Date().toISOString(),
      });
      addMessage({
        id: 'msg-2',
        show_id: 'show-1',
        thread_id: 'thread-1',
        sender_id: 'user-2',
        body: 'World',
        group_label: null,
        read_at: null,
        created_at: new Date().toISOString(),
      });

      expect(useMessageStore.getState().unreadCount).toBe(2);

      markThreadRead('thread-1');

      const state = useMessageStore.getState();
      expect(state.unreadCount).toBe(0);
      expect(state.messagesByThread['thread-1'].every(m => m.read_at !== null)).toBe(true);
    });
  });

  describe('reset', () => {
    it('clears all state', () => {
      const { addMessage, reset } = useMessageStore.getState();
      addMessage({
        id: 'msg-1',
        show_id: 'show-1',
        thread_id: 'thread-1',
        sender_id: 'user-2',
        body: 'Hello',
        group_label: null,
        read_at: null,
        created_at: new Date().toISOString(),
      });

      reset();

      const state = useMessageStore.getState();
      expect(state.threads).toEqual([]);
      expect(state.messagesByThread).toEqual({});
      expect(state.unreadCount).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/store/__tests__/messageStore.test.ts`

Expected: FAIL — `messageStore` module not found.

- [ ] **Step 3: Implement the message store**

```typescript
import { create } from 'zustand';
import { supabase } from '@/lib/supabaseClient';
import { useToastStore } from '@/store/toastStore';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Message, MessageThread } from '@/features/messages/types';

interface MessageState {
  threads: MessageThread[];
  messagesByThread: Record<string, Message[]>;
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  currentUserId: string | null;
  currentShowIds: string[];
  channels: RealtimeChannel[];
}

interface MessageActions {
  setCurrentUserId: (userId: string) => void;
  subscribe: (showIds: string[]) => void;
  unsubscribe: () => void;
  fetchThreads: (showId: string) => Promise<void>;
  fetchMessages: (threadId: string) => Promise<void>;
  addMessage: (message: Message) => void;
  markThreadRead: (threadId: string) => void;
  sendMessage: (threadId: string, showId: string, body: string) => Promise<void>;
  getOrCreateThread: (showId: string, participantId: string) => Promise<string | null>;
  reset: () => void;
}

const initialState: MessageState = {
  threads: [],
  messagesByThread: {},
  unreadCount: 0,
  isLoading: false,
  error: null,
  currentUserId: null,
  currentShowIds: [],
  channels: [],
};

export const useMessageStore = create<MessageState & MessageActions>((set, get) => ({
  ...initialState,

  setCurrentUserId: userId => set({ currentUserId: userId }),

  subscribe: (showIds: string[]) => {
    const state = get();

    // Skip if already subscribed to these shows
    if (
      state.currentShowIds.length === showIds.length &&
      state.currentShowIds.every(id => showIds.includes(id))
    ) {
      return;
    }

    // Clean up old channels
    state.channels.forEach(ch => supabase.removeChannel(ch));

    const newChannels: RealtimeChannel[] = [];

    for (const showId of showIds) {
      const channel = supabase
        .channel(`messages:${showId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'show_messages',
            filter: `show_id=eq.${showId}`,
          },
          payload => {
            const msg = payload.new as Message;
            get().addMessage(msg);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'show_message_threads',
            filter: `show_id=eq.${showId}`,
          },
          payload => {
            const updated = payload.new as MessageThread;
            set(s => ({
              threads: s.threads.map(t => (t.id === updated.id ? { ...t, ...updated } : t)),
            }));
          }
        )
        .subscribe();

      newChannels.push(channel);
    }

    set({ channels: newChannels, currentShowIds: showIds });

    // Fetch initial data
    set({ isLoading: true });
    Promise.all(showIds.map(id => get().fetchThreads(id))).finally(() => {
      set({ isLoading: false });
    });
  },

  unsubscribe: () => {
    const { channels } = get();
    channels.forEach(ch => supabase.removeChannel(ch));
    set({ channels: [], currentShowIds: [] });
  },

  // [EXPANDED] fetchThreads joins people table for participant name + latest message preview
  fetchThreads: async (showId: string) => {
    const { data, error } = await supabase
      .from('show_message_threads')
      .select(
        `
        *,
        participant:auth_user_id_fk(
          people!inner(first_name, last_name)
        )
      `
      )
      .eq('show_id', showId)
      .order('last_message_at', { ascending: false });

    if (error) {
      // Fallback: fetch without join if the relationship isn't set up
      const { data: fallback } = await supabase
        .from('show_message_threads')
        .select('*')
        .eq('show_id', showId)
        .order('last_message_at', { ascending: false });
      if (fallback) {
        // Enrich with people lookup
        const enriched = await Promise.all(
          fallback.map(async (thread: any) => {
            const { data: person } = await supabase
              .from('people')
              .select('first_name, last_name')
              .eq('auth_user_id', thread.participant_id)
              .single();
            return {
              ...thread,
              participant_name: person
                ? `${person.first_name} ${person.last_name}`.trim()
                : 'Unknown',
            };
          })
        );
        set(s => {
          const existingIds = new Set(s.threads.map(t => t.id));
          const newThreads = enriched.filter((t: MessageThread) => !existingIds.has(t.id));
          return { threads: [...s.threads, ...newThreads] };
        });
      }
      return;
    }

    // Map joined data to flat structure
    const enriched = (data || []).map((t: any) => ({
      ...t,
      participant_name: t.participant?.people
        ? `${t.participant.people.first_name} ${t.participant.people.last_name}`.trim()
        : 'Unknown',
    }));

    set(s => {
      const existingIds = new Set(s.threads.map(t => t.id));
      const newThreads = enriched.filter((t: MessageThread) => !existingIds.has(t.id));
      return { threads: [...s.threads, ...newThreads] };
    });
  },

  // [EXPANDED] fetchMessages joins people table for sender name
  fetchMessages: async (threadId: string) => {
    const { data: rawMessages, error } = await supabase
      .from('show_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });

    if (error) {
      set({ error: error.message });
      return;
    }

    // Enrich with sender names — batch-fetch unique sender_ids
    const messages = rawMessages || [];
    const senderIds = [...new Set(messages.map((m: any) => m.sender_id))];
    const senderMap = new Map<string, string>();

    if (senderIds.length > 0) {
      const { data: people } = await supabase
        .from('people')
        .select('auth_user_id, first_name, last_name')
        .in('auth_user_id', senderIds);
      (people || []).forEach((p: any) => {
        senderMap.set(p.auth_user_id, `${p.first_name} ${p.last_name}`.trim());
      });
    }

    const enriched = messages.map((m: any) => ({
      ...m,
      sender_name: senderMap.get(m.sender_id) || 'Unknown',
    }));

    const { data: enrichedData, error: enrichError } = { data: enriched, error: null };
    void enrichError; // suppress unused

    set(s => ({
      messagesByThread: { ...s.messagesByThread, [threadId]: enriched },
    }));

    if (error) {
      set({ error: error.message });
      return;
    }

    set(s => ({
      messagesByThread: { ...s.messagesByThread, [threadId]: data || [] },
    }));

    // Recalculate unread
    get().recalculateUnread();
  },

  addMessage: (message: Message) => {
    const state = get();

    set(s => {
      const threadMessages = s.messagesByThread[message.thread_id] || [];
      // Dedup
      if (threadMessages.some(m => m.id === message.id)) return s;

      const newUnread =
        message.sender_id !== s.currentUserId && !message.read_at
          ? s.unreadCount + 1
          : s.unreadCount;

      // Update thread's last_message_at
      const updatedThreads = s.threads.map(t =>
        t.id === message.thread_id ? { ...t, last_message_at: message.created_at } : t
      );

      return {
        messagesByThread: {
          ...s.messagesByThread,
          [message.thread_id]: [...threadMessages, message],
        },
        threads: updatedThreads,
        unreadCount: newUnread,
      };
    });

    // Trigger toast for messages from others
    if (message.sender_id !== state.currentUserId) {
      useToastStore.getState().addToast({
        id: `msg-${message.id}`,
        type: 'message',
        title: message.sender_name ? `Message from ${message.sender_name}` : 'New message',
        body: message.body.length > 100 ? message.body.substring(0, 97) + '...' : message.body,
        priority: 'high',
        timestamp: Date.now(),
      });
    }
  },

  markThreadRead: (threadId: string) => {
    const state = get();
    const messages = state.messagesByThread[threadId] || [];
    const unreadFromOthers = messages.filter(
      m => !m.read_at && m.sender_id !== state.currentUserId
    );

    if (unreadFromOthers.length === 0) return;

    const now = new Date().toISOString();

    // Optimistic update
    set(s => ({
      messagesByThread: {
        ...s.messagesByThread,
        [threadId]: (s.messagesByThread[threadId] || []).map(m =>
          !m.read_at && m.sender_id !== s.currentUserId ? { ...m, read_at: now } : m
        ),
      },
      unreadCount: Math.max(0, s.unreadCount - unreadFromOthers.length),
    }));

    // Persist to DB
    const unreadIds = unreadFromOthers.map(m => m.id);
    supabase
      .from('show_messages')
      .update({ read_at: now })
      .in('id', unreadIds)
      .then(({ error }) => {
        if (error) console.error('Failed to mark messages as read:', error);
      });
  },

  sendMessage: async (threadId: string, showId: string, body: string) => {
    const state = get();
    if (!state.currentUserId) return;

    const tempId = crypto.randomUUID();
    const tempMessage: Message = {
      id: tempId,
      show_id: showId,
      thread_id: threadId,
      sender_id: state.currentUserId,
      body,
      group_label: null,
      read_at: null,
      created_at: new Date().toISOString(),
    };

    // Optimistic add
    get().addMessage(tempMessage);

    const { data, error } = await supabase
      .from('show_messages')
      .insert({
        show_id: showId,
        thread_id: threadId,
        sender_id: state.currentUserId,
        body,
      })
      .select()
      .single();

    if (error) {
      // Rollback
      set(s => ({
        messagesByThread: {
          ...s.messagesByThread,
          [threadId]: (s.messagesByThread[threadId] || []).filter(m => m.id !== tempId),
        },
      }));
      throw error;
    }

    // Replace temp with real
    if (data) {
      set(s => ({
        messagesByThread: {
          ...s.messagesByThread,
          [threadId]: (s.messagesByThread[threadId] || []).map(m => (m.id === tempId ? data : m)),
        },
      }));
    }
  },

  getOrCreateThread: async (showId: string, participantId: string) => {
    const { data, error } = await supabase
      .from('show_message_threads')
      .upsert(
        {
          show_id: showId,
          participant_id: participantId,
          last_message_at: new Date().toISOString(),
        },
        { onConflict: 'show_id,participant_id', ignoreDuplicates: false }
      )
      .select('id')
      .single();

    if (error) {
      set({ error: error.message });
      return null;
    }

    // Add to local threads if not present
    if (data) {
      set(s => {
        if (s.threads.some(t => t.id === data.id)) return s;
        return {
          threads: [
            {
              ...data,
              show_id: showId,
              participant_id: participantId,
              last_message_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
            },
            ...s.threads,
          ],
        };
      });
    }

    return data?.id ?? null;
  },

  recalculateUnread: () => {
    const state = get();
    let count = 0;
    for (const msgs of Object.values(state.messagesByThread)) {
      count += msgs.filter(m => !m.read_at && m.sender_id !== state.currentUserId).length;
    }
    set({ unreadCount: count });
  },

  reset: () => {
    const { channels } = get();
    channels.forEach(ch => supabase.removeChannel(ch));
    set({ ...initialState });
  },
}));
```

Note: `recalculateUnread` is a private helper used internally — add it to the interface if tests need it, but it doesn't need to be part of the public API.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/store/__tests__/messageStore.test.ts`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/store/messageStore.ts apps/myk9show/src/store/__tests__/messageStore.test.ts
git commit -m "feat(chat): add message store with realtime subscriptions and tests"
```

---

## Task 6: Message Mutations Hook

**Files:**

- Create: `apps/myk9show/src/hooks/mutations/useMessageMutations.ts`
- Test: `apps/myk9show/src/hooks/mutations/__tests__/useMessageMutations.test.ts`

- [ ] **Step 1: Write tests for the mutations hook**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { useMessageMutations } from '../useMessageMutations';

vi.mock('@/store/messageStore', () => ({
  useMessageStore: Object.assign(
    vi.fn(selector => {
      const state = {
        sendMessage: vi.fn().mockResolvedValue(undefined),
        markThreadRead: vi.fn(),
        getOrCreateThread: vi.fn().mockResolvedValue('thread-1'),
      };
      return selector ? selector(state) : state;
    }),
    {
      getState: vi.fn().mockReturnValue({
        sendMessage: vi.fn(),
        markThreadRead: vi.fn(),
        getOrCreateThread: vi.fn().mockResolvedValue('thread-1'),
      }),
    }
  ),
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { sent_to: 5 }, error: null }),
    },
  },
}));

describe('useMessageMutations', () => {
  it('sends a message via store', async () => {
    const { result } = renderHook(() => useMessageMutations());

    await act(async () => {
      await result.current.sendMessage('thread-1', 'show-1', 'Hello secretary');
    });

    expect(result.current.isSending).toBe(false);
  });

  it('sends a targeted message via edge function', async () => {
    const { supabase } = await import('@/lib/supabaseClient');
    const { result } = renderHook(() => useMessageMutations());

    await act(async () => {
      await result.current.sendTargetedMessage('show-1', 'class-1', 'Class 4 is delayed');
    });

    expect(supabase.functions.invoke).toHaveBeenCalledWith('send-targeted-message', {
      body: { show_id: 'show-1', class_id: 'class-1', body: 'Class 4 is delayed' },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/hooks/mutations/__tests__/useMessageMutations.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the mutations hook**

```typescript
import { useCallback, useState } from 'react';
import { useMessageStore } from '@/store/messageStore';
import { supabase } from '@/lib/supabaseClient';
import { notifications } from '@/lib/notifications';

export function useMessageMutations() {
  const [isSending, setIsSending] = useState(false);
  const storeSendMessage = useMessageStore(s => s.sendMessage);
  const storeMarkRead = useMessageStore(s => s.markThreadRead);
  const storeGetOrCreateThread = useMessageStore(s => s.getOrCreateThread);

  const sendMessage = useCallback(
    async (threadId: string, showId: string, body: string) => {
      setIsSending(true);
      try {
        await storeSendMessage(threadId, showId, body);
      } catch {
        notifications.error('Failed to send message');
      } finally {
        setIsSending(false);
      }
    },
    [storeSendMessage]
  );

  const markThreadRead = useCallback(
    (threadId: string) => {
      storeMarkRead(threadId);
    },
    [storeMarkRead]
  );

  const getOrCreateThread = useCallback(
    async (showId: string, participantId: string) => {
      return storeGetOrCreateThread(showId, participantId);
    },
    [storeGetOrCreateThread]
  );

  const sendTargetedMessage = useCallback(async (showId: string, classId: string, body: string) => {
    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-targeted-message', {
        body: { show_id: showId, class_id: classId, body },
      });

      if (error) throw error;

      notifications.success(`Message sent to ${data?.sent_to ?? 0} exhibitors`);
      return data;
    } catch {
      notifications.error('Failed to send targeted message');
      return null;
    } finally {
      setIsSending(false);
    }
  }, []);

  return { sendMessage, markThreadRead, getOrCreateThread, sendTargetedMessage, isSending };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/hooks/mutations/__tests__/useMessageMutations.test.ts`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/hooks/mutations/useMessageMutations.ts apps/myk9show/src/hooks/mutations/__tests__/useMessageMutations.test.ts
git commit -m "feat(chat): add useMessageMutations hook with tests"
```

---

## Task 7: Shared UI Components — MessageBubble & MessageInput

**Files:**

- Create: `apps/myk9show/src/features/messages/components/MessageBubble.tsx`
- Create: `apps/myk9show/src/features/messages/components/MessageInput.tsx`
- Test: `apps/myk9show/src/features/messages/components/__tests__/MessageBubble.test.tsx`
- Test: `apps/myk9show/src/features/messages/components/__tests__/MessageInput.test.tsx`

- [ ] **Step 1: Write MessageBubble tests**

```typescript
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { MessageBubble } from '../MessageBubble';

const baseMessage = {
  id: 'msg-1',
  show_id: 'show-1',
  thread_id: 'thread-1',
  sender_id: 'user-2',
  body: 'Hello there!',
  group_label: null,
  read_at: null,
  created_at: '2026-04-01T10:00:00Z',
  sender_name: 'Jane Smith',
  sender_role: 'Secretary',
};

describe('MessageBubble', () => {
  it('renders message body', () => {
    render(<MessageBubble message={baseMessage} isOwnMessage={false} />);
    expect(screen.getByText('Hello there!')).toBeInTheDocument();
  });

  it('shows sender name and role for other messages', () => {
    render(<MessageBubble message={baseMessage} isOwnMessage={false} />);
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('Secretary')).toBeInTheDocument();
  });

  it('applies own-message styling', () => {
    const { container } = render(<MessageBubble message={baseMessage} isOwnMessage={true} />);
    expect(container.querySelector('[data-own-message="true"]')).toBeInTheDocument();
  });

  it('displays group label when present', () => {
    const msg = { ...baseMessage, group_label: 'Sent to all Class 4 exhibitors' };
    render(<MessageBubble message={msg} isOwnMessage={false} />);
    expect(screen.getByText('Sent to all Class 4 exhibitors')).toBeInTheDocument();
  });

  it('shows formatted timestamp', () => {
    render(<MessageBubble message={baseMessage} isOwnMessage={false} />);
    // Should show time portion
    expect(screen.getByText(/10:00/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Write MessageInput tests**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { MessageInput } from '../MessageInput';

describe('MessageInput', () => {
  it('renders a text input and send button', () => {
    render(<MessageInput onSend={vi.fn()} />);
    expect(screen.getByPlaceholderText(/message/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
  });

  it('disables send button when input is empty', () => {
    render(<MessageInput onSend={vi.fn()} />);
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });

  it('calls onSend with trimmed message and clears input', async () => {
    const onSend = vi.fn();
    const { user } = render(<MessageInput onSend={onSend} />);

    const input = screen.getByPlaceholderText(/message/i);
    await user.type(input, 'Hello secretary');
    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(onSend).toHaveBeenCalledWith('Hello secretary');
    expect(input).toHaveValue('');
  });

  it('sends on Enter key press', async () => {
    const onSend = vi.fn();
    const { user } = render(<MessageInput onSend={onSend} />);

    const input = screen.getByPlaceholderText(/message/i);
    await user.type(input, 'Hello{Enter}');

    expect(onSend).toHaveBeenCalledWith('Hello');
  });

  it('disables input and button when disabled prop is true', () => {
    render(<MessageInput onSend={vi.fn()} disabled />);
    expect(screen.getByPlaceholderText(/message/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/features/messages/components/__tests__/`

Expected: FAIL — modules not found.

- [ ] **Step 4: Implement MessageBubble**

```tsx
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { Message } from '@/features/messages/types';

interface MessageBubbleProps {
  message: Message;
  isOwnMessage: boolean;
}

export function MessageBubble({ message, isOwnMessage }: MessageBubbleProps) {
  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      data-own-message={isOwnMessage}
      className={cn(
        'flex flex-col max-w-[80%] gap-1',
        isOwnMessage ? 'ml-auto items-end' : 'items-start'
      )}
    >
      {!isOwnMessage && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{message.sender_name ?? 'Unknown'}</span>
          {message.sender_role && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
              {message.sender_role}
            </Badge>
          )}
        </div>
      )}
      <div
        className={cn(
          'rounded-lg px-3 py-2 text-sm',
          isOwnMessage ? 'bg-primary text-primary-foreground' : 'bg-muted'
        )}
      >
        {message.body}
      </div>
      {message.group_label && (
        <span className="text-[10px] text-muted-foreground italic">{message.group_label}</span>
      )}
      <span className="text-[10px] text-muted-foreground">{time}</span>
    </div>
  );
}
```

- [ ] **Step 5: Implement MessageInput**

```tsx
import { useState, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send } from 'lucide-react';

interface MessageInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function MessageInput({
  onSend,
  disabled = false,
  placeholder = 'Type a message...',
}: MessageInputProps) {
  const [value, setValue] = useState('');

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex items-center gap-2 p-3 border-t">
      <Input
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1"
      />
      <Button
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        size="icon"
        aria-label="Send"
      >
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/features/messages/components/__tests__/`

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/features/messages/components/MessageBubble.tsx apps/myk9show/src/features/messages/components/MessageInput.tsx apps/myk9show/src/features/messages/components/__tests__/
git commit -m "feat(chat): add MessageBubble and MessageInput components with tests"
```

---

## Task 8: Non-Secretary Chat Page

**Files:**

- Create: `apps/myk9show/src/features/messages/pages/ChatPage.tsx`
- Test: `apps/myk9show/src/features/messages/pages/__tests__/ChatPage.test.tsx`

- [ ] **Step 1: Write ChatPage tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import ChatPage from '../ChatPage';

const mockMessages = [
  {
    id: 'msg-1',
    show_id: 'show-1',
    thread_id: 'thread-1',
    sender_id: 'user-2',
    body: 'Your paperwork is missing',
    group_label: null,
    read_at: null,
    created_at: '2026-04-01T10:00:00Z',
    sender_name: 'Jane Secretary',
    sender_role: 'Secretary',
  },
];

const mockStoreState = {
  threads: [{ id: 'thread-1', show_id: 'show-1', participant_id: 'user-1', last_message_at: '2026-04-01T10:00:00Z', created_at: '2026-04-01T09:00:00Z' }],
  messagesByThread: { 'thread-1': mockMessages },
  unreadCount: 1,
  isLoading: false,
  currentUserId: 'user-1',
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  fetchMessages: vi.fn(),
  sendMessage: vi.fn(),
  markThreadRead: vi.fn(),
  getOrCreateThread: vi.fn().mockResolvedValue('thread-1'),
  setCurrentUserId: vi.fn(),
  reset: vi.fn(),
};

vi.mock('@/store/messageStore', () => ({
  useMessageStore: vi.fn((selector) => (selector ? selector(mockStoreState) : mockStoreState)),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, isAdmin: false, isSecretary: false }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useParams: () => ({ showId: 'show-1' }) };
});

describe('ChatPage', () => {
  it('renders the message list', () => {
    render(<ChatPage />);
    expect(screen.getByText('Your paperwork is missing')).toBeInTheDocument();
  });

  it('renders the message input', () => {
    render(<ChatPage />);
    expect(screen.getByPlaceholderText(/message/i)).toBeInTheDocument();
  });

  it('shows empty state when no thread exists', () => {
    const emptyState = { ...mockStoreState, threads: [], messagesByThread: {} };
    vi.mocked(await import('@/store/messageStore')).useMessageStore.mockImplementation(
      (selector: any) => (selector ? selector(emptyState) : emptyState)
    );
    render(<ChatPage />);
    expect(screen.getByText(/start a conversation/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/features/messages/pages/__tests__/ChatPage.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement ChatPage**

```tsx
import { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useMessageStore } from '@/store/messageStore';
import { useMessageMutations } from '@/hooks/mutations/useMessageMutations';
import { MessageBubble } from '@/features/messages/components/MessageBubble';
import { MessageInput } from '@/features/messages/components/MessageInput';
import { MessageSquare } from 'lucide-react';

export default function ChatPage() {
  const { showId } = useParams<{ showId: string }>();
  const { user } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const threads = useMessageStore(s => s.threads);
  const messagesByThread = useMessageStore(s => s.messagesByThread);
  const isLoading = useMessageStore(s => s.isLoading);
  const subscribe = useMessageStore(s => s.subscribe);
  const unsubscribe = useMessageStore(s => s.unsubscribe);
  const fetchMessages = useMessageStore(s => s.fetchMessages);
  const setCurrentUserId = useMessageStore(s => s.setCurrentUserId);
  const getOrCreateThread = useMessageStore(s => s.getOrCreateThread);
  const storeMarkThreadRead = useMessageStore(s => s.markThreadRead);

  const { sendMessage, isSending } = useMessageMutations();

  // Find the user's thread for this show
  const thread = threads.find(t => t.show_id === showId && t.participant_id === user?.id);
  const messages = thread ? messagesByThread[thread.id] || [] : [];

  useEffect(() => {
    if (user?.id) setCurrentUserId(user.id);
  }, [user?.id, setCurrentUserId]);

  useEffect(() => {
    if (showId) subscribe([showId]);
    return () => unsubscribe();
  }, [showId, subscribe, unsubscribe]);

  useEffect(() => {
    if (thread?.id) {
      fetchMessages(thread.id);
      storeMarkThreadRead(thread.id);
    }
  }, [thread?.id, fetchMessages, storeMarkThreadRead]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async (body: string) => {
    if (!showId || !user?.id) return;

    let threadId = thread?.id;
    if (!threadId) {
      threadId = await getOrCreateThread(showId, user.id);
      if (!threadId) return;
    }

    await sendMessage(threadId, showId, body);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-muted-foreground">Loading messages...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Messages</h1>
        <p className="text-sm text-muted-foreground">Chat with the trial secretary</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <MessageSquare className="h-12 w-12 mb-3 opacity-50" />
            <p className="text-lg font-medium">Start a conversation</p>
            <p className="text-sm">Send a message to the trial secretary</p>
          </div>
        ) : (
          messages.map(msg => (
            <MessageBubble key={msg.id} message={msg} isOwnMessage={msg.sender_id === user?.id} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <MessageInput onSend={handleSend} disabled={isSending} />
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/features/messages/pages/__tests__/ChatPage.test.ts`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/features/messages/pages/ChatPage.tsx apps/myk9show/src/features/messages/pages/__tests__/
git commit -m "feat(chat): add ChatPage for non-secretary users"
```

---

## Task 9: Thread List Components (Secretary Inbox)

**Files:**

- Create: `apps/myk9show/src/features/messages/components/ThreadListItem.tsx`
- Create: `apps/myk9show/src/features/messages/components/ThreadList.tsx`
- Test: `apps/myk9show/src/features/messages/components/__tests__/ThreadList.test.tsx`

- [ ] **Step 1: Write ThreadList tests**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ThreadList } from '../ThreadList';

const threads = [
  {
    id: 'thread-1',
    show_id: 'show-1',
    participant_id: 'user-1',
    last_message_at: '2026-04-01T10:00:00Z',
    created_at: '2026-04-01T09:00:00Z',
    participant_name: 'Alice Handler',
    participant_role: 'Exhibitor',
    unread_count: 2,
    last_message_preview: 'Can I switch my run order?',
  },
  {
    id: 'thread-2',
    show_id: 'show-1',
    participant_id: 'user-2',
    last_message_at: '2026-04-01T09:30:00Z',
    created_at: '2026-04-01T09:00:00Z',
    participant_name: 'Bob Judge',
    participant_role: 'Judge',
    unread_count: 0,
    last_message_preview: 'Ring 2 is ready',
  },
];

describe('ThreadList', () => {
  it('renders all threads', () => {
    render(<ThreadList threads={threads} activeThreadId={null} onSelectThread={vi.fn()} />);
    expect(screen.getByText('Alice Handler')).toBeInTheDocument();
    expect(screen.getByText('Bob Judge')).toBeInTheDocument();
  });

  it('shows unread indicator for threads with unread messages', () => {
    render(<ThreadList threads={threads} activeThreadId={null} onSelectThread={vi.fn()} />);
    expect(screen.getByText('2')).toBeInTheDocument(); // unread badge
  });

  it('shows message preview', () => {
    render(<ThreadList threads={threads} activeThreadId={null} onSelectThread={vi.fn()} />);
    expect(screen.getByText('Can I switch my run order?')).toBeInTheDocument();
  });

  it('calls onSelectThread when a thread is clicked', async () => {
    const onSelect = vi.fn();
    const { user } = render(<ThreadList threads={threads} activeThreadId={null} onSelectThread={onSelect} />);

    await user.click(screen.getByText('Alice Handler'));
    expect(onSelect).toHaveBeenCalledWith('thread-1');
  });

  it('highlights the active thread', () => {
    const { container } = render(
      <ThreadList threads={threads} activeThreadId="thread-1" onSelectThread={vi.fn()} />
    );
    expect(container.querySelector('[data-active="true"]')).toBeInTheDocument();
  });

  it('shows empty state when no threads', () => {
    render(<ThreadList threads={[]} activeThreadId={null} onSelectThread={vi.fn()} />);
    expect(screen.getByText(/no conversations/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/features/messages/components/__tests__/ThreadList.test.tsx`

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement ThreadListItem**

```tsx
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { MessageThread } from '@/features/messages/types';

interface ThreadListItemProps {
  thread: MessageThread;
  isActive: boolean;
  onClick: () => void;
}

export function ThreadListItem({ thread, isActive, onClick }: ThreadListItemProps) {
  const time = new Date(thread.last_message_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <button
      onClick={onClick}
      data-active={isActive}
      className={cn(
        'w-full text-left px-4 py-3 border-b transition-colors hover:bg-accent/50',
        isActive && 'bg-accent'
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium truncate">{thread.participant_name ?? 'Unknown'}</span>
          {thread.participant_role && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 shrink-0">
              {thread.participant_role}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {(thread.unread_count ?? 0) > 0 && (
            <Badge
              variant="default"
              className="h-5 min-w-[20px] flex items-center justify-center text-[10px]"
            >
              {thread.unread_count}
            </Badge>
          )}
          <span className="text-[10px] text-muted-foreground">{time}</span>
        </div>
      </div>
      {thread.last_message_preview && (
        <p className="text-sm text-muted-foreground truncate mt-0.5">
          {thread.last_message_preview}
        </p>
      )}
    </button>
  );
}
```

- [ ] **Step 4: Implement ThreadList**

```tsx
import { MessageSquare } from 'lucide-react';
import { ThreadListItem } from './ThreadListItem';
import type { MessageThread } from '@/features/messages/types';

interface ThreadListProps {
  threads: MessageThread[];
  activeThreadId: string | null;
  onSelectThread: (threadId: string) => void;
}

export function ThreadList({ threads, activeThreadId, onSelectThread }: ThreadListProps) {
  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-4">
        <MessageSquare className="h-10 w-10 mb-2 opacity-50" />
        <p>No conversations yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto">
      {threads.map(thread => (
        <ThreadListItem
          key={thread.id}
          thread={thread}
          isActive={thread.id === activeThreadId}
          onClick={() => onSelectThread(thread.id)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/features/messages/components/__tests__/ThreadList.test.tsx`

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/features/messages/components/ThreadListItem.tsx apps/myk9show/src/features/messages/components/ThreadList.tsx apps/myk9show/src/features/messages/components/__tests__/ThreadList.test.tsx
git commit -m "feat(chat): add ThreadList and ThreadListItem components with tests"
```

---

## Task 10: Compose Targeted Modal

**Files:**

- Create: `apps/myk9show/src/features/messages/components/ComposeTargetedModal.tsx`
- Test: `apps/myk9show/src/features/messages/components/__tests__/ComposeTargetedModal.test.tsx`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ComposeTargetedModal } from '../ComposeTargetedModal';

const mockClasses = [
  { id: 'class-1', class_number: 1, class_name: 'Novice A', entry_count: 8 },
  { id: 'class-2', class_number: 2, class_name: 'Open B', entry_count: 12 },
];

describe('ComposeTargetedModal', () => {
  it('renders class selector when no classId is pre-selected', () => {
    render(
      <ComposeTargetedModal
        open={true}
        onClose={vi.fn()}
        onSend={vi.fn()}
        showId="show-1"
        classes={mockClasses}
      />
    );
    expect(screen.getByText(/select a class/i)).toBeInTheDocument();
  });

  it('pre-selects class when classId is provided', () => {
    render(
      <ComposeTargetedModal
        open={true}
        onClose={vi.fn()}
        onSend={vi.fn()}
        showId="show-1"
        classes={mockClasses}
        preSelectedClassId="class-1"
      />
    );
    expect(screen.getByText(/Novice A/)).toBeInTheDocument();
    expect(screen.getByText(/8 exhibitors/i)).toBeInTheDocument();
  });

  it('calls onSend with classId and body', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { user } = render(
      <ComposeTargetedModal
        open={true}
        onClose={vi.fn()}
        onSend={onSend}
        showId="show-1"
        classes={mockClasses}
        preSelectedClassId="class-2"
      />
    );

    const input = screen.getByPlaceholderText(/message/i);
    await user.type(input, 'Class 2 is delayed 15 minutes');
    await user.click(screen.getByRole('button', { name: /send/i }));

    expect(onSend).toHaveBeenCalledWith('class-2', 'Class 2 is delayed 15 minutes');
  });

  it('disables send when no message is entered', () => {
    render(
      <ComposeTargetedModal
        open={true}
        onClose={vi.fn()}
        onSend={vi.fn()}
        showId="show-1"
        classes={mockClasses}
        preSelectedClassId="class-1"
      />
    );
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/features/messages/components/__tests__/ComposeTargetedModal.test.tsx`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement ComposeTargetedModal**

```tsx
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Send, Users } from 'lucide-react';

interface ClassOption {
  id: string;
  class_number: number;
  class_name: string;
  entry_count: number;
}

interface ComposeTargetedModalProps {
  open: boolean;
  onClose: () => void;
  onSend: (classId: string, body: string) => Promise<void>;
  showId: string;
  classes: ClassOption[];
  preSelectedClassId?: string;
}

export function ComposeTargetedModal({
  open,
  onClose,
  onSend,
  classes,
  preSelectedClassId,
}: ComposeTargetedModalProps) {
  const [selectedClassId, setSelectedClassId] = useState(preSelectedClassId ?? '');
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);

  const selectedClass = classes.find(c => c.id === selectedClassId);

  const handleSend = async () => {
    if (!selectedClassId || !body.trim()) return;
    setIsSending(true);
    try {
      await onSend(selectedClassId, body.trim());
      setBody('');
      onClose();
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={isOpen => !isOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Message Class Exhibitors</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!preSelectedClassId ? (
            <div>
              <label className="text-sm font-medium mb-1.5 block">Select a class</label>
              <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      Class {c.class_number} — {c.class_name} ({c.entry_count} entries)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {selectedClass && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted rounded-md px-3 py-2">
              <Users className="h-4 w-4" />
              <span>
                Class {selectedClass.class_number} — {selectedClass.class_name} ·{' '}
                {selectedClass.entry_count} exhibitors
              </span>
            </div>
          )}

          <Textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Type a message..."
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={isSending || !selectedClassId || !body.trim()}
            aria-label="Send"
          >
            <Send className="h-4 w-4 mr-2" />
            {isSending ? 'Sending...' : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/features/messages/components/__tests__/ComposeTargetedModal.test.tsx`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/features/messages/components/ComposeTargetedModal.tsx apps/myk9show/src/features/messages/components/__tests__/ComposeTargetedModal.test.tsx
git commit -m "feat(chat): add ComposeTargetedModal for class messaging"
```

---

## Task 11: Secretary Messages Page

**Files:**

- Create: `apps/myk9show/src/features/messages/pages/SecretaryMessagesPage.tsx`
- Test: `apps/myk9show/src/features/messages/pages/__tests__/SecretaryMessagesPage.test.tsx`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import SecretaryMessagesPage from '../SecretaryMessagesPage';

const mockThreads = [
  {
    id: 'thread-1',
    show_id: 'show-1',
    participant_id: 'user-1',
    last_message_at: '2026-04-01T10:00:00Z',
    created_at: '2026-04-01T09:00:00Z',
    participant_name: 'Alice Handler',
    participant_role: 'Exhibitor',
    unread_count: 2,
    last_message_preview: 'Can I switch my run?',
  },
];

const mockMessages = [
  {
    id: 'msg-1',
    show_id: 'show-1',
    thread_id: 'thread-1',
    sender_id: 'user-1',
    body: 'Can I switch my run?',
    group_label: null,
    read_at: null,
    created_at: '2026-04-01T10:00:00Z',
    sender_name: 'Alice Handler',
    sender_role: 'Exhibitor',
  },
];

vi.mock('@/store/messageStore', () => ({
  useMessageStore: vi.fn((selector) => {
    const state = {
      threads: mockThreads,
      messagesByThread: { 'thread-1': mockMessages },
      unreadCount: 2,
      isLoading: false,
      currentUserId: 'secretary-1',
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      fetchMessages: vi.fn(),
      sendMessage: vi.fn(),
      markThreadRead: vi.fn(),
      setCurrentUserId: vi.fn(),
      getOrCreateThread: vi.fn(),
      reset: vi.fn(),
    };
    return selector ? selector(state) : state;
  }),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'secretary-1' }, isSecretary: true, isAdmin: false }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useParams: () => ({ showId: 'show-1' }) };
});

describe('SecretaryMessagesPage', () => {
  it('renders the thread list', () => {
    render(<SecretaryMessagesPage />);
    expect(screen.getByText('Alice Handler')).toBeInTheDocument();
    expect(screen.getByText('Can I switch my run?')).toBeInTheDocument();
  });

  it('renders new targeted message button', () => {
    render(<SecretaryMessagesPage />);
    expect(screen.getByRole('button', { name: /message class/i })).toBeInTheDocument();
  });

  it('shows empty state when no thread is selected', () => {
    render(<SecretaryMessagesPage />);
    expect(screen.getByText(/select a conversation/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/features/messages/pages/__tests__/SecretaryMessagesPage.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement SecretaryMessagesPage**

```tsx
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useMessageStore } from '@/store/messageStore';
import { useMessageMutations } from '@/hooks/mutations/useMessageMutations';
import { ThreadList } from '@/features/messages/components/ThreadList';
import { MessageBubble } from '@/features/messages/components/MessageBubble';
import { MessageInput } from '@/features/messages/components/MessageInput';
import { ComposeTargetedModal } from '@/features/messages/components/ComposeTargetedModal';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MessageSquare, Users } from 'lucide-react';

export default function SecretaryMessagesPage() {
  const { showId } = useParams<{ showId: string }>();
  const { user } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [showTargetedModal, setShowTargetedModal] = useState(false);

  const threads = useMessageStore(s => s.threads);
  const messagesByThread = useMessageStore(s => s.messagesByThread);
  const isLoading = useMessageStore(s => s.isLoading);
  const subscribe = useMessageStore(s => s.subscribe);
  const unsubscribe = useMessageStore(s => s.unsubscribe);
  const fetchMessages = useMessageStore(s => s.fetchMessages);
  const setCurrentUserId = useMessageStore(s => s.setCurrentUserId);
  const storeMarkThreadRead = useMessageStore(s => s.markThreadRead);

  const { sendMessage, sendTargetedMessage, isSending } = useMessageMutations();

  const activeMessages = activeThreadId ? messagesByThread[activeThreadId] || [] : [];

  // Filter threads for current show
  const showThreads = threads.filter(t => t.show_id === showId);

  useEffect(() => {
    if (user?.id) setCurrentUserId(user.id);
  }, [user?.id, setCurrentUserId]);

  useEffect(() => {
    if (showId) subscribe([showId]);
    return () => unsubscribe();
  }, [showId, subscribe, unsubscribe]);

  useEffect(() => {
    if (activeThreadId) {
      fetchMessages(activeThreadId);
      storeMarkThreadRead(activeThreadId);
    }
  }, [activeThreadId, fetchMessages, storeMarkThreadRead]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages.length]);

  const handleSend = async (body: string) => {
    if (!activeThreadId || !showId) return;
    await sendMessage(activeThreadId, showId, body);
  };

  const handleTargetedSend = async (classId: string, body: string) => {
    if (!showId) return;
    await sendTargetedMessage(showId, classId, body);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-muted-foreground">Loading messages...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Thread list sidebar — hidden on mobile when a thread is active */}
      <div
        className={cn(
          'w-full md:w-80 border-r flex flex-col shrink-0',
          activeThreadId && 'hidden md:flex'
        )}
      >
        <div className="p-4 border-b flex items-center justify-between">
          <h1 className="text-lg font-semibold">Messages</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTargetedModal(true)}
            aria-label="Message class"
          >
            <Users className="h-4 w-4 mr-1" />
            Message Class
          </Button>
        </div>
        <ThreadList
          threads={showThreads}
          activeThreadId={activeThreadId}
          onSelectThread={setActiveThreadId}
        />
      </div>

      {/* Active conversation — full width on mobile, flex-1 on desktop */}
      <div className={cn('flex-1 flex flex-col', !activeThreadId && 'hidden md:flex')}>
        {activeThreadId ? (
          <>
            {/* Back button on mobile */}
            <div className="md:hidden p-2 border-b">
              <Button variant="ghost" size="sm" onClick={() => setActiveThreadId(null)}>
                ← Back
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {activeMessages.map(msg => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isOwnMessage={msg.sender_id === user?.id}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
            <MessageInput onSend={handleSend} disabled={isSending} />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <MessageSquare className="h-12 w-12 mb-3 opacity-50" />
            <p>Select a conversation to view messages</p>
          </div>
        )}
      </div>

      <ComposeTargetedModal
        open={showTargetedModal}
        onClose={() => setShowTargetedModal(false)}
        onSend={handleTargetedSend}
        showId={showId ?? ''}
        classes={classes}
      />
    </div>
  );
}
```

The `classes` variable comes from the `useQuery` hook added in Task 13 Step 2. When implementing Task 11, add the query inline (shown below) so the component is self-contained from the start:

```typescript
const { data: classes = [] } = useQuery({
  queryKey: ['show-classes-for-messages', showId],
  queryFn: async () => {
    if (!showId) return [];
    const { data } = await supabase
      .from('classes')
      .select('id, class_number, class_name')
      .eq('show_id', showId)
      .order('class_number');
    const withCounts = await Promise.all(
      (data || []).map(async c => {
        const { count } = await supabase
          .from('entries')
          .select('id', { count: 'exact', head: true })
          .eq('class_id', c.id)
          .is('deleted_at', null);
        return { ...c, entry_count: count ?? 0 };
      })
    );
    return withCounts;
  },
  enabled: !!showId,
});
```

Add the imports for `useQuery` and `supabase` at the top of the file.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/features/messages/pages/__tests__/SecretaryMessagesPage.test.ts`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/features/messages/pages/SecretaryMessagesPage.tsx apps/myk9show/src/features/messages/pages/__tests__/
git commit -m "feat(chat): add SecretaryMessagesPage with inbox and conversation view"
```

---

## Task 12: Route & Sidebar Integration

**Files:**

- Modify: `apps/myk9show/src/routes/secretaryRoutes.tsx`
- Modify: `apps/myk9show/src/routes/publicRoutes.tsx` (or appropriate exhibitor route file)
- Modify: `apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts`

- [ ] **Step 1: Add lazy imports and routes to secretaryRoutes.tsx**

At the top of `secretaryRoutes.tsx`, add the lazy import alongside existing ones:

```typescript
const SecretaryMessagesPage = lazy(() => import('@/features/messages/pages/SecretaryMessagesPage'));
```

Inside the secretary routes JSX, add:

```tsx
<Route
  path="/secretary/messages/:showId?"
  element={
    <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
      <SuspenseWrapper>
        <PageTransition>
          <SecretaryMessagesPage />
        </PageTransition>
      </SuspenseWrapper>
    </ProtectedRoute>
  }
/>
```

- [ ] **Step 2: Add exhibitor chat route to publicRoutes.tsx**

At the top of `publicRoutes.tsx`, add:

```typescript
const ChatPage = lazy(() => import('@/features/messages/pages/ChatPage'));
```

Add the route (inside authenticated routes section):

```tsx
<Route
  path="/messages/:showId"
  element={
    <SuspenseWrapper>
      <PageTransition>
        <ChatPage />
      </PageTransition>
    </SuspenseWrapper>
  }
/>
```

- [ ] **Step 3: Add Messages nav item to sidebar config**

In `apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts`, find the secretary "Manage" section items array and add:

```typescript
{
  title: 'Messages',
  href: '/secretary/messages',
  icon: MessageSquare,
  description: 'Chat with exhibitors and participants',
},
```

Import `MessageSquare` from `lucide-react` at the top of the file.

For non-secretary roles, add a "Messages" item in their nav section:

```typescript
{
  title: 'Messages',
  href: '/messages',
  icon: MessageSquare,
  description: 'Chat with the trial secretary',
},
```

- [ ] **Step 4: Run typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`

Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/routes/secretaryRoutes.tsx apps/myk9show/src/routes/publicRoutes.tsx apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts
git commit -m "feat(chat): add routes and sidebar nav for messages"
```

---

## Task 13: Wire Class Data to Targeted Modal & Add "Message Class" Button

**Files:**

- Modify: `apps/myk9show/src/features/messages/pages/SecretaryMessagesPage.tsx` — wire class data to ComposeTargetedModal
- Modify: Class details page (find the correct file) — add "Message class" button

- [ ] **Step 1: Find the class details page file**

Search for the class details page component that secretaries use. Look for files matching `ClassDetail` or similar in `apps/myk9show/src/features/` or `apps/myk9show/src/pages/`.

- [ ] **Step 2: Add a useClasses query to SecretaryMessagesPage**

In `SecretaryMessagesPage.tsx`, fetch classes for the current show to pass to the modal. Use the existing query pattern:

```typescript
import { supabase } from '@/lib/supabaseClient';
import { useQuery } from '@tanstack/react-query';

// Inside the component:
const { data: classes = [] } = useQuery({
  queryKey: ['show-classes', showId],
  queryFn: async () => {
    if (!showId) return [];
    const { data } = await supabase
      .from('classes')
      .select('id, class_number, class_name')
      .eq('show_id', showId)
      .order('class_number');

    // Get entry counts
    const withCounts = await Promise.all(
      (data || []).map(async c => {
        const { count } = await supabase
          .from('entries')
          .select('id', { count: 'exact', head: true })
          .eq('class_id', c.id)
          .is('deleted_at', null);
        return { ...c, entry_count: count ?? 0 };
      })
    );
    return withCounts;
  },
  enabled: !!showId,
});
```

Then update the modal prop: `classes={classes}`.

- [ ] **Step 3: Add "Message class" button to class details page**

On the class details page, add a button that opens the compose modal pre-selected to that class:

```tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MessageSquare } from 'lucide-react';
import { ComposeTargetedModal } from '@/features/messages/components/ComposeTargetedModal';
import { useMessageMutations } from '@/hooks/mutations/useMessageMutations';

// Inside the component:
const [showMessageModal, setShowMessageModal] = useState(false);
const { sendTargetedMessage } = useMessageMutations();

// In the page header actions area:
<Button variant="outline" size="sm" onClick={() => setShowMessageModal(true)}>
  <MessageSquare className="h-4 w-4 mr-2" />
  Message Class
</Button>

// At the bottom of the component JSX:
<ComposeTargetedModal
  open={showMessageModal}
  onClose={() => setShowMessageModal(false)}
  onSend={async (classId, body) => {
    await sendTargetedMessage(showId, classId, body);
  }}
  showId={showId}
  classes={[{ id: classId, class_number: classNumber, class_name: className, entry_count: entryCount }]}
  preSelectedClassId={classId}
/>
```

Adjust variable names to match the actual props/state available in the class details component.

- [ ] **Step 4: Run typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`

Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/features/messages/pages/SecretaryMessagesPage.tsx apps/myk9show/src/features/  # add class details file too
git commit -m "feat(chat): wire class data to targeted modal and add Message Class button"
```

---

## Task 14: Unread Badge on Nav Item

**Files:**

- Modify: `apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts` (or the sidebar rendering component)

- [ ] **Step 1: Find where sidebar items render badges**

Search for how the sidebar renders nav items — look for where the `title`, `href`, `icon` from the config get rendered. The unread badge needs to be added to the Messages nav item.

- [ ] **Step 2: Add unread count from messageStore**

The sidebar component (or a wrapper) should read from `useMessageStore`:

```typescript
import { useMessageStore } from '@/store/messageStore';

// Inside the sidebar rendering logic, for the Messages item:
const unreadCount = useMessageStore((s) => s.unreadCount);

// Render a badge next to the "Messages" title when unreadCount > 0
{unreadCount > 0 && (
  <Badge variant="default" className="ml-auto h-5 min-w-[20px] text-[10px]">
    {unreadCount}
  </Badge>
)}
```

The exact implementation depends on how the sidebar currently renders items. Adapt to the existing pattern — if items are rendered generically from config, you may need to add a `badge` field to the config item or handle Messages as a special case.

- [ ] **Step 3: Initialize message subscription on app load**

In the app's root layout or auth-aware wrapper (where announcements subscribe), add message store subscription. Find where `useAnnouncementStore.subscribe()` is called and add the equivalent for messages:

```typescript
import { useMessageStore } from '@/store/messageStore';

// Where announcement subscription happens:
const messageSubscribe = useMessageStore(s => s.subscribe);
const messageSetUser = useMessageStore(s => s.setCurrentUserId);

useEffect(() => {
  if (user?.id) {
    messageSetUser(user.id);
  }
}, [user?.id, messageSetUser]);

useEffect(() => {
  if (activeShowIds.length > 0) {
    messageSubscribe(activeShowIds);
  }
}, [activeShowIds, messageSubscribe]);
```

Adapt `activeShowIds` to however the app currently determines which shows the user is associated with.

- [ ] **Step 4: [ADDED] Verify push notification dedup in service worker**

Check `apps/myk9show/src/sw-custom.ts` to verify it handles the `chat_message` notification type. The existing service worker should already navigate to `actionUrl` on click. Verify:

1. The `push` event handler in `sw-custom.ts` can display notifications with the payload shape from Task 2 (`{ title, body, data: { type, actionUrl, ... } }`)
2. The `notificationclick` handler navigates to `data.actionUrl`
3. If the existing `useNotificationMonitor` has dedup logic that suppresses push when the app is in the foreground, verify it covers the `chat_message` type. If dedup is tied to specific notification types, add `chat_message` to the list.

If the service worker already handles arbitrary push payloads generically (which is the common pattern), no changes are needed. If it checks `data.type`, add `chat_message` as a handled type.

- [ ] **Step 5: Run typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`

Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add -A  # stage all modified sidebar/layout files
git commit -m "feat(chat): add unread badge to Messages nav and initialize subscription"
```

---

## Task 15: Final Integration Test & Cleanup

- [ ] **Step 1: Run all message-related tests**

Run: `cd apps/myk9show && npx vitest run src/store/__tests__/messageStore.test.ts src/hooks/mutations/__tests__/useMessageMutations.test.ts src/features/messages/`

Expected: All tests PASS.

- [ ] **Step 2: Run full typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`

Expected: No errors.

- [ ] **Step 3: Run lint**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm lint`

Expected: No errors in new files.

- [ ] **Step 4: Run full test suite**

Run: `cd apps/myk9show && pnpm test`

Expected: No new failures. Existing tests still pass.

- [ ] **Step 5: Manual smoke test**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm dev:show`

Verify:

1. Messages nav item appears in sidebar for all roles
2. Non-secretary: clicking Messages shows empty state with "Start a conversation" prompt
3. Secretary: clicking Messages shows inbox (empty initially)
4. Sending a message works (check browser console for Supabase errors)
5. No console errors on page load

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix(chat): address integration issues from smoke test"
```

---

## Deployment Steps (Post-Merge)

These are not part of the implementation tasks but are needed to go live:

1. **Push database migration:**

   ```bash
   supabase db push
   ```

2. **Deploy edge functions:**

   ```bash
   supabase functions deploy push-trigger-chat-message --no-verify-jwt
   supabase functions deploy send-targeted-message --no-verify-jwt
   ```

3. **Verify `app.settings.edge_function_base_url`** is configured in Supabase dashboard (needed by the `notify_chat_message` database trigger). This should already be set from the announcement push trigger.

4. **[ADDED] Verify VAPID environment variables** are set for the `push-trigger-chat-message` function: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. These should already be configured from the announcement push function but confirm they're available to the new function.

---

## [ADDED] Known Limitations (v1)

- **No message/thread pagination** — `fetchMessages` loads all messages for a thread; `fetchThreads` loads all threads for a show. Acceptable for typical show sizes (50-200 participants, <100 messages per thread). Add cursor-based pagination if shows grow larger.
- **No E2E tests** — v1 relies on unit tests + manual smoke testing. E2E tests should be added once the feature stabilizes (exhibitor sends → secretary receives → secretary replies → exhibitor sees).
- **No message deletion** — Users cannot delete or edit sent messages. Add if requested.
- **Sender role not displayed** — Messages show sender name but not their role badge (would require joining to `user_roles` during enrichment). The thread list shows participant role for secretary context; message-level role display can be added later.
