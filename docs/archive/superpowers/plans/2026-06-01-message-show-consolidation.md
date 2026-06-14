# Message Show Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the separate Show Desk Quick Broadcast and Class Broadcast tools with one show-scoped Message Show composer, and reuse that same compose contract from `/secretary/messages?showId=...`.

**Architecture:** Add one shared message-show helper module for recipient/template/delivery-lane behavior, then build one reusable `MessageShowComposer` component around the existing announcement and targeted-message send paths. Show Desk owns the primary embedded composer; the Messages page keeps inbox/history and opens the same composer in a dialog.

**Tech Stack:** React, TypeScript, shadcn/ui, Vitest, React Testing Library, existing `useWorkbenchAnnouncementPost`, existing `useMessageMutations`, existing `send-targeted-message`, existing `show_announcements`.

---

## Scope Check

This is one subsystem: secretary show-scoped messaging UI. It changes the `show_messages` table only to add an explicit `push_alert` flag needed for the approved push-alert behavior; it does not change announcement tables, RLS, push subscription schema, or service worker navigation.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: This touches a database migration, edge functions, push delivery behavior, and a secretary show-day workflow; focused tests are required for each contract, then full typecheck/lint and manual staging verification before merge.

## File Map

- Create `apps/myk9show/src/features/show-workbench/messageShow.ts`
  - Owns recipient types, templates, default body/title generation, delivery-lane mapping, and class-label helpers.
- Create `apps/myk9show/src/features/show-workbench/MessageShowComposer.tsx`
  - Reusable composer UI and send orchestration.
- Create `apps/myk9show/src/features/show-workbench/__tests__/messageShow.test.ts`
  - Pure helper coverage.
- Create `apps/myk9show/src/features/show-workbench/__tests__/MessageShowComposer.test.tsx`
  - Component coverage for recipient/template/push/send/failure behavior.
- Create `supabase/migrations/20260601161000_add_show_message_push_alert.sql`
  - Adds explicit per-message push intent for targeted group sends and recreates `notify_chat_message()` so it honors that flag.
- Modify `supabase/functions/send-targeted-message/index.ts`
  - Accepts `send_push`, writes `show_messages.push_alert`, and skips passcode fanout when push is off.
- Modify `supabase/functions/push-trigger-chat-message/index.ts`
  - Reads current `push_subscriptions.p256dh/auth` columns for account-recipient pushes instead of stale `keys` JSON.
- Modify `apps/myk9show/src/features/messages/types.ts`
  - Adds `sendPush?: boolean` to `MessageTarget`.
- Modify `apps/myk9show/src/hooks/mutations/useMessageMutations.ts`
  - Passes `send_push` to `send-targeted-message`.
- Modify `apps/myk9show/src/hooks/mutations/__tests__/useMessageMutations.test.ts`
  - Verifies the payload includes `send_push`.
- Modify `apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx`
  - Replace Quick Broadcast and Class Broadcast sections with one Message Show section.
- Modify `apps/myk9show/src/features/messages/pages/SecretaryMessagesPage.tsx`
  - Replace `ComposeTargetedModal` entry with the shared `MessageShowComposer` in a dialog.
- Modify or delete `apps/myk9show/src/features/messages/components/ComposeTargetedModal.tsx`
  - Remove only after `SecretaryMessagesPage` no longer imports it.
- Modify tests:
  - `apps/myk9show/src/test/pages/secretary/ShowWorkbenchPage.test.tsx`
  - `apps/myk9show/src/features/messages/pages/__tests__/SecretaryMessagesPage.test.tsx`
  - Existing Quick/Class card tests may remain temporarily if unused files remain, but remove stale integration expectations.
- Modify `OPEN-TODOS.md`
  - Mark the consolidation todo complete after implementation and verification.

## Task 1: Add Shared Message Show Helper

**Files:**
- Create: `apps/myk9show/src/features/show-workbench/messageShow.ts`
- Create: `apps/myk9show/src/features/show-workbench/__tests__/messageShow.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create `apps/myk9show/src/features/show-workbench/__tests__/messageShow.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  MESSAGE_SHOW_TEMPLATES,
  buildMessageShowDraft,
  buildMessageShowClassLabel,
  getMessageShowDeliveryLane,
  getMessageShowTemplate,
} from '../messageShow';

describe('messageShow', () => {
  it('keeps show-wide shortcuts available', () => {
    expect(MESSAGE_SHOW_TEMPLATES.map(template => template.id)).toEqual([
      'lunch-ready',
      'ring-paused',
      'results-posted',
      'report-to-gate',
      'class-delayed',
    ]);
  });

  it('builds a show-wide announcement draft', () => {
    expect(buildMessageShowDraft('lunch-ready')).toEqual({
      title: 'Lunch is ready',
      body: 'Lunch is ready for judges, stewards, and volunteers. Please check in at hospitality.',
    });
  });

  it('builds a class-specific draft with the class label', () => {
    expect(buildMessageShowDraft('report-to-gate', 'Container Novice A & B')).toEqual({
      title: 'Report to gate',
      body: 'Please report to the gate for Container Novice A & B. We are getting ready for your class.',
    });
  });

  it('maps recipients to the correct delivery lanes', () => {
    expect(getMessageShowDeliveryLane('all_show')).toBe('announcement');
    expect(getMessageShowDeliveryLane('class')).toBe('targeted');
    expect(getMessageShowDeliveryLane('checked_in')).toBe('targeted');
  });

  it('falls back to the default template for missing template ids', () => {
    expect(getMessageShowTemplate('missing-template')).toMatchObject({
      id: 'lunch-ready',
      label: 'Lunch ready',
    });
  });

  it('builds class labels without leaking UUID values', () => {
    expect(
      buildMessageShowClassLabel({
        name: '10e39f5f-ef3d-4673-b62c-116dd50ab071',
        className: 'Container Novice A & B',
        section: 'A & B',
      })
    ).toBe('Container Novice A & B');
  });
});
```

- [ ] **Step 2: Run helper tests and confirm failure**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/show-workbench/__tests__/messageShow.test.ts
```

Expected: fail because `../messageShow` does not exist.

- [ ] **Step 3: Implement helper module**

Create `apps/myk9show/src/features/show-workbench/messageShow.ts`:

```ts
export type MessageShowRecipientType = 'all_show' | 'class' | 'checked_in';
export type MessageShowDeliveryLane = 'announcement' | 'targeted';
export type MessageShowTemplateId =
  | 'lunch-ready'
  | 'ring-paused'
  | 'results-posted'
  | 'report-to-gate'
  | 'class-delayed';

export interface MessageShowTemplate {
  id: MessageShowTemplateId;
  label: string;
  title: string;
  body: (className?: string) => string;
  preferredRecipient: MessageShowRecipientType;
}

export interface MessageShowClassOption {
  id: string;
  label: string;
  entryCount: number;
}

export const MESSAGE_SHOW_TEMPLATES = [
  {
    id: 'lunch-ready',
    label: 'Lunch ready',
    title: 'Lunch is ready',
    preferredRecipient: 'all_show',
    body: () =>
      'Lunch is ready for judges, stewards, and volunteers. Please check in at hospitality.',
  },
  {
    id: 'ring-paused',
    label: 'Ring paused',
    title: 'Ring paused',
    preferredRecipient: 'all_show',
    body: () =>
      'The ring is paused. Please stay nearby and listen for the next update from the show desk.',
  },
  {
    id: 'results-posted',
    label: 'Results posted',
    title: 'Results posted',
    preferredRecipient: 'all_show',
    body: () => 'Results have been posted. Please contact the secretary desk with questions.',
  },
  {
    id: 'report-to-gate',
    label: 'Report to gate',
    title: 'Report to gate',
    preferredRecipient: 'class',
    body: className =>
      `Please report to the gate for ${className?.trim() || 'your class'}. We are getting ready for your class.`,
  },
  {
    id: 'class-delayed',
    label: 'Class delayed',
    title: 'Class delayed',
    preferredRecipient: 'class',
    body: className =>
      `${className?.trim() || 'Your class'} is running later than posted. Please stay nearby and listen for updates.`,
  },
] as const satisfies readonly MessageShowTemplate[];

export const DEFAULT_MESSAGE_SHOW_TEMPLATE = MESSAGE_SHOW_TEMPLATES[0];

export function getMessageShowTemplate(templateId: string): MessageShowTemplate {
  return (
    MESSAGE_SHOW_TEMPLATES.find(template => template.id === templateId) ??
    DEFAULT_MESSAGE_SHOW_TEMPLATE
  );
}

export function buildMessageShowDraft(
  templateId: string,
  className?: string
): { title: string; body: string } {
  const template = getMessageShowTemplate(templateId);
  return {
    title: template.title,
    body: template.body(className),
  };
}

export function getMessageShowDeliveryLane(
  recipientType: MessageShowRecipientType
): MessageShowDeliveryLane {
  return recipientType === 'all_show' ? 'announcement' : 'targeted';
}

export function buildMessageShowClassLabel({
  className,
  class_name,
  name,
  element,
  level,
  section,
}: {
  className?: string | null;
  class_name?: string | null;
  name?: string | null;
  element?: string | null;
  level?: string | null;
  section?: string | null;
}): string {
  const composedName = [displayText(element), displayText(level)].filter(Boolean).join(' ');
  const cleanName = firstDisplayText(className, class_name, name, composedName) ?? 'this class';
  const cleanSection = section?.trim() ?? '';
  if (!cleanSection) return cleanName;
  if (hasTrailingSection(cleanName, cleanSection)) return cleanName;
  return `${cleanName} ${cleanSection}`.trim();
}

function firstDisplayText(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const text = displayText(value);
    if (text) return text;
  }
  return null;
}

function displayText(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text || isUuidLike(text)) return null;
  return text;
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function hasTrailingSection(name: string, section: string): boolean {
  const escapedSection = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${escapedSection}$`, 'i').test(name);
}
```

- [ ] **Step 4: Run helper tests**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/show-workbench/__tests__/messageShow.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/features/show-workbench/messageShow.ts apps/myk9show/src/features/show-workbench/__tests__/messageShow.test.ts
git commit -m "feat(show): add message show helper"
```

## Task 2: Add Targeted Push Opt-In Contract

**Files:**
- Create: `supabase/migrations/20260601161000_add_show_message_push_alert.sql`
- Modify: `supabase/functions/send-targeted-message/index.ts`
- Modify: `apps/myk9show/src/features/messages/types.ts`
- Modify: `apps/myk9show/src/hooks/mutations/useMessageMutations.ts`
- Modify: `apps/myk9show/src/hooks/mutations/__tests__/useMessageMutations.test.ts`
- Create: `apps/myk9show/src/features/messages/__tests__/targetedPushContract.test.ts`

- [ ] **Step 1: Write failing hook payload test**

In `apps/myk9show/src/hooks/mutations/__tests__/useMessageMutations.test.ts`, add this assertion-focused test:

```ts
it('passes targeted push intent to the edge function', async () => {
  const { supabase } = await import('@/lib/supabase-client');
  const { result } = renderHook(() => useMessageMutations());

  await act(async () => {
    await result.current.sendTargetedMessage(
      'show-1',
      { type: 'class', classId: 'class-1', sendPush: true },
      'Class 4 is delayed'
    );
  });

  expect(supabase.functions.invoke).toHaveBeenCalledWith('send-targeted-message', {
    body: {
      show_id: 'show-1',
      target_type: 'class',
      class_id: 'class-1',
      send_push: true,
      body: 'Class 4 is delayed',
    },
  });
});
```

- [ ] **Step 2: Write failing function/migration contract tests**

Create `apps/myk9show/src/features/messages/__tests__/targetedPushContract.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../../..');
const functionPath = resolve(repoRoot, 'supabase/functions/send-targeted-message/index.ts');
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260601161000_add_show_message_push_alert.sql'
);
describe('targeted message push contract', () => {
  it('adds an explicit push_alert flag to show messages', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain('add column if not exists push_alert boolean not null default true');
  });

  it('writes push_alert from send_push when creating targeted message rows', () => {
    const source = readFileSync(functionPath, 'utf8');

    expect(source).toContain('send_push?: boolean');
    expect(source).toContain('const sendPush = payload.send_push === true;');
    expect(source).toContain('push_alert: sendPush');
  });

  it('skips chat push when push_alert is false', () => {
    const migration = readFileSync(migrationPath, 'utf8');

    expect(migration).toContain('if new.push_alert is false then');
    expect(migration).toContain('return new;');
  });

  it('skips passcode push fanout when send_push is false', () => {
    const source = readFileSync(functionPath, 'utf8');

    expect(source).toContain('const ringsideTargets = sendPush');
    expect(source).toContain(': [];');
  });
});
```

- [ ] **Step 3: Run new tests and confirm failure**

Run:

```bash
cd apps/myk9show && npx vitest run \
  src/hooks/mutations/__tests__/useMessageMutations.test.ts \
  src/features/messages/__tests__/targetedPushContract.test.ts
```

Expected: fail because `sendPush`, `send_push`, `push_alert`, and the new migration do not exist.

- [ ] **Step 4: Add app type and hook payload support**

In `apps/myk9show/src/features/messages/types.ts`, change:

```ts
export interface MessageTarget {
  type: MessageTargetType;
  classId?: string;
}
```

To:

```ts
export interface MessageTarget {
  type: MessageTargetType;
  classId?: string;
  sendPush?: boolean;
}
```

In `apps/myk9show/src/hooks/mutations/useMessageMutations.ts`, change the invoke body to include `send_push`:

```ts
body: {
  show_id: showId,
  target_type: target.type,
  ...(target.classId ? { class_id: target.classId } : {}),
  send_push: target.sendPush === true,
  body,
},
```

- [ ] **Step 5: Add migration for `show_messages.push_alert` and gated chat push**

Create `supabase/migrations/20260601161000_add_show_message_push_alert.sql`:

```sql
alter table public.show_messages
  add column if not exists push_alert boolean not null default true;

create or replace function public.notify_chat_message()
returns trigger
language plpgsql
security definer
as $$
declare
  edge_function_base_url text;
  service_role_key text;
begin
  if new.push_alert is false then
    return new;
  end if;

  edge_function_base_url := current_setting('app.settings.edge_function_base_url', true);
  service_role_key := current_setting('app.settings.service_role_key', true);

  if edge_function_base_url is null
    or edge_function_base_url = ''
    or service_role_key is null
    or service_role_key = ''
  then
    raise notice 'notify_chat_message skipped because edge function config is not set';
    return new;
  end if;

  perform net.http_post(
    url := edge_function_base_url || '/push-trigger-chat-message',
    body := jsonb_build_object(
      'record', jsonb_build_object(
        'id', new.id,
        'show_id', new.show_id,
        'thread_id', new.thread_id,
        'sender_id', new.sender_id,
        'body', new.body,
        'created_at', new.created_at
      )
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    )
  );

  return new;
end;
$$;
```

- [ ] **Step 6: Add edge function support for `send_push`**

In `supabase/functions/send-targeted-message/index.ts`, change the payload interface:

```ts
interface SendTargetedMessagePayload {
  show_id?: string;
  class_id?: string;
  target_type?: TargetType;
  body?: string;
  send_push?: boolean;
}
```

After `const body = payload.body?.trim();`, add:

```ts
const sendPush = payload.send_push === true;
```

When building `messageInserts`, add:

```ts
push_alert: sendPush,
```

Change ringside target lookup from:

```ts
const ringsideTargets = await fetchRingsidePushTargets(supabase, showId, targetType, armbands);
```

To:

```ts
const ringsideTargets = sendPush
  ? await fetchRingsidePushTargets(supabase, showId, targetType, armbands)
  : [];
```

- [ ] **Step 7: Run push contract tests**

Run:

```bash
cd apps/myk9show && npx vitest run \
  src/hooks/mutations/__tests__/useMessageMutations.test.ts \
  src/features/messages/__tests__/targetedPushContract.test.ts
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add apps/myk9show/src/features/messages/types.ts apps/myk9show/src/hooks/mutations/useMessageMutations.ts apps/myk9show/src/hooks/mutations/__tests__/useMessageMutations.test.ts apps/myk9show/src/features/messages/__tests__/targetedPushContract.test.ts supabase/functions/send-targeted-message/index.ts supabase/migrations/20260601161000_add_show_message_push_alert.sql
git commit -m "feat(show): add targeted message push opt-in"
```

## Task 3: Fix Account Push Subscription Contract

**Files:**
- Modify: `supabase/functions/push-trigger-chat-message/index.ts`
- Modify: `apps/myk9show/src/features/messages/__tests__/targetedPushContract.test.ts`

- [ ] **Step 1: Expand the push contract test**

In `apps/myk9show/src/features/messages/__tests__/targetedPushContract.test.ts`, add:

```ts
const chatPushFunctionPath = resolve(
  repoRoot,
  'supabase/functions/push-trigger-chat-message/index.ts'
);

it('uses current push subscription key columns for account chat pushes', () => {
  const source = readFileSync(chatPushFunctionPath, 'utf8');

  expect(source).toContain(".select('id, user_id, endpoint, p256dh, auth')");
  expect(source).toContain('keys: { p256dh: sub.p256dh, auth: sub.auth }');
  expect(source).not.toContain(".select('id, user_id, endpoint, keys')");
});
```

- [ ] **Step 2: Run contract test and confirm failure**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/messages/__tests__/targetedPushContract.test.ts
```

Expected: fail because `push-trigger-chat-message` still selects `keys`.

- [ ] **Step 3: Update `push-trigger-chat-message` subscription query**

In `supabase/functions/push-trigger-chat-message/index.ts`, replace:

```ts
.select('id, user_id, endpoint, keys')
```

With:

```ts
.select('id, user_id, endpoint, p256dh, auth')
```

Replace:

```ts
await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, pushPayload);
```

With:

```ts
if (!sub.p256dh || !sub.auth) return;
await webpush.sendNotification(
  { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
  pushPayload
);
```

- [ ] **Step 4: Run contract test**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/messages/__tests__/targetedPushContract.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/push-trigger-chat-message/index.ts apps/myk9show/src/features/messages/__tests__/targetedPushContract.test.ts
git commit -m "fix(show): align chat push subscription keys"
```

## Task 4: Build Reusable Message Show Composer

**Files:**
- Create: `apps/myk9show/src/features/show-workbench/MessageShowComposer.tsx`
- Create: `apps/myk9show/src/features/show-workbench/__tests__/MessageShowComposer.test.tsx`

- [ ] **Step 1: Write failing component tests**

Create `apps/myk9show/src/features/show-workbench/__tests__/MessageShowComposer.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { MessageShowComposer } from '../MessageShowComposer';

const postAnnouncement = vi.fn();
const sendTargetedMessage = vi.fn();

vi.mock('../workbenchAnnouncementPost', () => ({
  useWorkbenchAnnouncementPost: () => ({ postAnnouncement }),
}));

vi.mock('@/hooks/mutations/useMessageMutations', () => ({
  useMessageMutations: () => ({
    sendTargetedMessage,
    isSending: false,
  }),
}));

describe('MessageShowComposer', () => {
  const classes = [
    { id: 'class-1', label: 'Container Novice A & B', entryCount: 4 },
    { id: 'class-2', label: 'Interior Excellent', entryCount: 0 },
  ];

  beforeEach(() => {
    postAnnouncement.mockReset();
    sendTargetedMessage.mockReset();
    postAnnouncement.mockResolvedValue(undefined);
    sendTargetedMessage.mockResolvedValue({ sent_to: 1 });
  });

  it('sends everyone-in-show messages through announcements', async () => {
    const { user } = render(<MessageShowComposer showId="show-1" classes={classes} />);

    await user.click(screen.getByRole('button', { name: /results posted/i }));
    await user.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => {
      expect(postAnnouncement).toHaveBeenCalledWith(
        expect.objectContaining({
          showId: 'show-1',
          title: 'Results posted',
          content: 'Results have been posted. Please contact the secretary desk with questions.',
          priority: 'normal',
          errorMessage: 'Could not send message',
        })
      );
    });
    expect(sendTargetedMessage).not.toHaveBeenCalled();
  });

  it('uses high priority when push alert is selected for everyone-in-show', async () => {
    const { user } = render(<MessageShowComposer showId="show-1" classes={classes} />);

    await user.click(screen.getByLabelText(/send push alert/i));
    await user.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => {
      expect(postAnnouncement).toHaveBeenCalledWith(expect.objectContaining({ priority: 'high' }));
    });
  });

  it('sends class messages through targeted messaging', async () => {
    const { user } = render(<MessageShowComposer showId="show-1" classes={classes} />);

    await user.click(screen.getByRole('combobox', { name: /recipient/i }));
    await user.click(screen.getByRole('option', { name: /a class/i }));
    await user.click(screen.getByRole('button', { name: /report to gate/i }));
    await user.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => {
      expect(sendTargetedMessage).toHaveBeenCalledWith(
        'show-1',
        { type: 'class', classId: 'class-1', sendPush: false },
        'Please report to the gate for Container Novice A & B. We are getting ready for your class.'
      );
    });
    expect(postAnnouncement).not.toHaveBeenCalled();
  });

  it('sends checked-in messages through targeted messaging', async () => {
    const { user } = render(<MessageShowComposer showId="show-1" classes={classes} />);

    await user.click(screen.getByRole('combobox', { name: /recipient/i }));
    await user.click(screen.getByRole('option', { name: /everyone checked in/i }));
    await user.clear(screen.getByLabelText(/message/i));
    await user.type(screen.getByLabelText(/message/i), 'Gate is moving now.');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => {
      expect(sendTargetedMessage).toHaveBeenCalledWith(
        'show-1',
        { type: 'checked_in', sendPush: false },
        'Gate is moving now.'
      );
    });
  });

  it('passes push intent to targeted sends', async () => {
    const { user } = render(<MessageShowComposer showId="show-1" classes={classes} />);

    await user.click(screen.getByRole('combobox', { name: /recipient/i }));
    await user.click(screen.getByRole('option', { name: /a class/i }));
    await user.click(screen.getByLabelText(/send push alert/i));
    await user.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => {
      expect(sendTargetedMessage).toHaveBeenCalledWith(
        'show-1',
        expect.objectContaining({ type: 'class', sendPush: true }),
        expect.any(String)
      );
    });
  });

  it('keeps edited copy when a send fails', async () => {
    postAnnouncement.mockRejectedValueOnce(new Error('nope'));
    const { user } = render(<MessageShowComposer showId="show-1" classes={classes} />);

    await user.clear(screen.getByLabelText(/message/i));
    await user.type(screen.getByLabelText(/message/i), 'Custom lunch note');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => {
      expect(postAnnouncement).toHaveBeenCalled();
    });
    expect(screen.getByDisplayValue('Custom lunch note')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run component tests and confirm failure**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/show-workbench/__tests__/MessageShowComposer.test.tsx
```

Expected: fail because `MessageShowComposer` does not exist.

- [ ] **Step 3: Implement composer**

Create `apps/myk9show/src/features/show-workbench/MessageShowComposer.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Megaphone, RotateCcw, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useMessageMutations } from '@/hooks/mutations/useMessageMutations';
import {
  buildMessageShowDraft,
  getMessageShowDeliveryLane,
  MESSAGE_SHOW_TEMPLATES,
  type MessageShowClassOption,
  type MessageShowRecipientType,
  type MessageShowTemplateId,
} from './messageShow';
import { WorkbenchPushAlertToggle } from './WorkbenchPushAlertToggle';
import { getWorkbenchAnnouncementPriority } from './workbenchAnnouncementPriority';
import { useWorkbenchAnnouncementPost } from './workbenchAnnouncementPost';
import { buildQuickBroadcastExpiresAt } from './quickBroadcast';

interface MessageShowComposerProps {
  showId: string;
  classes: MessageShowClassOption[];
  onSent?: () => void;
  showHistoryLink?: boolean;
}

function entryCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'entry' : 'entries'}`;
}

export function MessageShowComposer({
  showId,
  classes,
  onSent,
  showHistoryLink = true,
}: MessageShowComposerProps) {
  const [recipientType, setRecipientType] = useState<MessageShowRecipientType>('all_show');
  const [selectedClassId, setSelectedClassId] = useState(classes[0]?.id ?? '');
  const [selectedTemplateId, setSelectedTemplateId] =
    useState<MessageShowTemplateId>('lunch-ready');
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  const [bodyOverride, setBodyOverride] = useState<string | null>(null);
  const [sendPushAlert, setSendPushAlert] = useState(false);
  const [isPostingAnnouncement, setIsPostingAnnouncement] = useState(false);

  const { postAnnouncement } = useWorkbenchAnnouncementPost();
  const { sendTargetedMessage, isSending } = useMessageMutations();

  const selectedClass = classes.find(cls => cls.id === selectedClassId) ?? classes[0] ?? null;
  const selectedClassLabel = selectedClass?.label;
  const draft = useMemo(
    () => buildMessageShowDraft(selectedTemplateId, selectedClassLabel),
    [selectedTemplateId, selectedClassLabel]
  );
  const title = titleOverride ?? draft.title;
  const body = bodyOverride ?? draft.body;
  const deliveryLane = getMessageShowDeliveryLane(recipientType);
  const needsClass = recipientType === 'class';
  const hasRecipients = recipientType !== 'class' || Boolean(selectedClass && selectedClass.entryCount > 0);
  const canSend = Boolean(body.trim() && (!needsClass || selectedClass) && hasRecipients);
  const isBusy = isPostingAnnouncement || isSending;

  function applyTemplate(templateId: MessageShowTemplateId) {
    setSelectedTemplateId(templateId);
    setTitleOverride(null);
    setBodyOverride(null);
    const template = MESSAGE_SHOW_TEMPLATES.find(item => item.id === templateId);
    if (template && template.preferredRecipient !== recipientType) {
      setRecipientType(template.preferredRecipient);
    }
  }

  function reset() {
    setRecipientType('all_show');
    setSelectedTemplateId('lunch-ready');
    setTitleOverride(null);
    setBodyOverride(null);
    setSendPushAlert(false);
    setSelectedClassId(classes[0]?.id ?? '');
  }

  async function handleSend() {
    if (!body.trim()) {
      toast.error('Add a message before sending');
      return;
    }
    if (needsClass && !selectedClass) {
      toast.error('Choose a class before sending');
      return;
    }
    if (!hasRecipients) {
      toast.error('There is nobody to message for that target');
      return;
    }

    if (deliveryLane === 'announcement') {
      setIsPostingAnnouncement(true);
      try {
        await postAnnouncement({
          showId,
          title: title.trim() || 'Show update',
          content: body.trim(),
          priority: getWorkbenchAnnouncementPriority(sendPushAlert),
          expiresAt: buildQuickBroadcastExpiresAt(),
          successMessage: sendPushAlert
            ? 'Message sent and push alert queued'
            : 'Message sent',
          errorMessage: 'Could not send message',
          undoSuccessMessage: 'Message removed',
          undoErrorMessage: 'Could not remove message',
          onPosted: () => {
            reset();
            onSent?.();
          },
        });
      } finally {
        setIsPostingAnnouncement(false);
      }
      return;
    }

    const target =
      recipientType === 'class'
        ? { type: 'class' as const, classId: selectedClass?.id ?? '', sendPush: sendPushAlert }
        : { type: 'checked_in' as const, sendPush: sendPushAlert };
    const result = await sendTargetedMessage(showId, target, body.trim());
    if (result) {
      reset();
      onSent?.();
    }
  }

  return (
    <section className="rounded-md border bg-card p-4" aria-labelledby="message-show-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="message-show-title" className="text-base font-semibold">
            Message Show
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Send show updates, class messages, and time-sensitive alerts from one place.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={reset} disabled={isBusy}>
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            Reset
          </Button>
          <Button type="button" size="sm" onClick={handleSend} disabled={!canSend || isBusy}>
            <Send className="mr-2 h-4 w-4" aria-hidden="true" />
            {isBusy ? 'Sending...' : 'Send message'}
          </Button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label id="message-show-recipient-label">Recipient</Label>
          <Select value={recipientType} onValueChange={value => setRecipientType(value as MessageShowRecipientType)}>
            <SelectTrigger aria-labelledby="message-show-recipient-label">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all_show">Everyone in show</SelectItem>
              <SelectItem value="class">A class</SelectItem>
              <SelectItem value="checked_in">Everyone checked in</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {recipientType === 'class' ? (
          <div className="space-y-2">
            <Label id="message-show-class-label">Class</Label>
            <Select value={selectedClass?.id ?? ''} onValueChange={setSelectedClassId} disabled={!classes.length}>
              <SelectTrigger aria-labelledby="message-show-class-label">
                <SelectValue placeholder="Select a class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map(cls => (
                  <SelectItem key={cls.id} value={cls.id}>
                    {cls.label} · {entryCountLabel(cls.entryCount)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      <WorkbenchPushAlertToggle
        id="message-show-push"
        checked={sendPushAlert}
        onCheckedChange={setSendPushAlert}
        description="Also notify recipients outside the app."
      />

      <div className="mt-4 flex flex-wrap gap-2">
        {MESSAGE_SHOW_TEMPLATES.map(template => (
          <Button
            key={template.id}
            type="button"
            variant={selectedTemplateId === template.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => applyTemplate(template.id)}
          >
            <Megaphone className="mr-2 h-4 w-4" aria-hidden="true" />
            {template.label}
          </Button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3">
        {deliveryLane === 'announcement' ? (
          <div className="space-y-2">
            <Label htmlFor="message-show-title-input">Title</Label>
            <Input
              id="message-show-title-input"
              value={title}
              onChange={event => setTitleOverride(event.target.value)}
              maxLength={200}
            />
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="message-show-body">Message</Label>
          <Textarea
            id="message-show-body"
            value={body}
            onChange={event => setBodyOverride(event.target.value)}
            rows={3}
            maxLength={5000}
          />
          {!hasRecipients ? (
            <p className="text-sm text-muted-foreground">
              There is nobody to message for that target.
            </p>
          ) : null}
        </div>
      </div>

      {showHistoryLink ? (
        <div className="mt-4 border-t pt-3">
          <Link
            to={`/secretary/messages?showId=${showId}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            View message history and replies
          </Link>
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 4: Run component tests and fix API mismatch if needed**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/show-workbench/__tests__/MessageShowComposer.test.tsx
```

Expected: pass after adjusting only real type/API mismatches discovered by the compiler or test output.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/features/show-workbench/MessageShowComposer.tsx apps/myk9show/src/features/show-workbench/__tests__/MessageShowComposer.test.tsx
git commit -m "feat(show): add message show composer"
```

## Task 5: Replace Show Desk Quick/Class Tools

**Files:**
- Modify: `apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx`
- Modify: `apps/myk9show/src/test/pages/secretary/ShowWorkbenchPage.test.tsx`

- [ ] **Step 1: Write failing workbench integration expectations**

In `apps/myk9show/src/test/pages/secretary/ShowWorkbenchPage.test.tsx`, update the existing Show Desk tools assertion so it expects one Message Show section and no separate Quick/Class headings:

```tsx
expect(within(dialog).getByRole('heading', { name: 'Message Show' })).toBeInTheDocument();
expect(within(dialog).queryByRole('heading', { name: 'Quick broadcast' })).not.toBeInTheDocument();
expect(within(dialog).queryByRole('heading', { name: 'Message a class' })).not.toBeInTheDocument();
```

- [ ] **Step 2: Run workbench test and confirm failure**

Run:

```bash
cd apps/myk9show && npx vitest run src/test/pages/secretary/ShowWorkbenchPage.test.tsx -t "Quick broadcast"
```

Expected: fail because the workbench still renders Quick Broadcast and Class Broadcast.

- [ ] **Step 3: Replace imports and tool sections**

In `apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx`:

Remove these imports:

```ts
import { ClassBroadcastCard } from '@/features/show-workbench/ClassBroadcastCard';
import { buildClassBroadcastClassLabel } from '@/features/show-workbench/classBroadcast';
import { QuickBroadcastCard } from '@/features/show-workbench/QuickBroadcastCard';
```

Add:

```ts
import { MessageShowComposer } from '@/features/show-workbench/MessageShowComposer';
import { buildMessageShowClassLabel } from '@/features/show-workbench/messageShow';
```

Replace the two tool entries:

```tsx
{
  id: 'quick-broadcast',
  title: 'Quick broadcast',
  summary: 'Send a general update to show participants',
  content: <QuickBroadcastCard showId={currentShow.id} />,
},
{
  id: 'class-broadcast',
  title: 'Class broadcast',
  summary: 'Send a class-specific update',
  content: (
    <ClassBroadcastCard
      showId={currentShow.id}
      classes={showClasses.map(cls => ({
        id: cls.id,
        label: buildClassBroadcastClassLabel({
          name: cls.name,
          section: cls.section,
        }),
        entryCount: cls.entryCount,
      }))}
    />
  ),
},
```

With:

```tsx
{
  id: 'message-show',
  title: 'Message Show',
  summary: 'Send updates, class messages, and push alerts',
  content: (
    <MessageShowComposer
      showId={currentShow.id}
      classes={showClasses.map(cls => ({
        id: cls.id,
        label: buildMessageShowClassLabel({
          className: cls.className ?? null,
          name: cls.name,
          element: cls.element,
          level: cls.level,
          section: cls.section,
        }),
        entryCount: cls.entryCount,
      }))}
    />
  ),
},
```

- [ ] **Step 4: Run workbench test**

Run:

```bash
cd apps/myk9show && npx vitest run src/test/pages/secretary/ShowWorkbenchPage.test.tsx
```

Expected: pass. If the suite is too broad or slow, run the specific updated test name and report the narrower command.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/secretary/ShowWorkbenchPage.tsx apps/myk9show/src/test/pages/secretary/ShowWorkbenchPage.test.tsx
git commit -m "refactor(show): replace broadcast tools with message show"
```

## Task 6: Reuse Composer From Secretary Messages Page

**Files:**
- Modify: `apps/myk9show/src/features/messages/pages/SecretaryMessagesPage.tsx`
- Modify: `apps/myk9show/src/features/messages/pages/__tests__/SecretaryMessagesPage.test.tsx`
- Delete if unused: `apps/myk9show/src/features/messages/components/ComposeTargetedModal.tsx`
- Delete if unused: `apps/myk9show/src/features/messages/components/__tests__/ComposeTargetedModal.test.tsx`

- [ ] **Step 1: Write failing Messages page expectations**

In `apps/myk9show/src/features/messages/pages/__tests__/SecretaryMessagesPage.test.tsx`, update the compose test to expect the shared composer heading:

```tsx
await user.click(screen.getByRole('button', { name: /message show/i }));
expect(screen.getByRole('heading', { name: 'Message Show' })).toBeInTheDocument();
expect(screen.getByText(/also notify recipients outside the app/i)).toBeInTheDocument();
```

- [ ] **Step 2: Run Messages page test and confirm failure**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/messages/pages/__tests__/SecretaryMessagesPage.test.tsx -t "Message Show"
```

Expected: fail because the page still opens `ComposeTargetedModal` with `Message Exhibitors`.

- [ ] **Step 3: Replace targeted modal with shared composer dialog**

In `apps/myk9show/src/features/messages/pages/SecretaryMessagesPage.tsx`:

Remove:

```ts
import { ComposeTargetedModal } from '@/features/messages/components/ComposeTargetedModal';
import type { MessageTarget } from '@/features/messages/types';
```

Add:

```ts
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MessageShowComposer } from '@/features/show-workbench/MessageShowComposer';
import { buildMessageShowClassLabel } from '@/features/show-workbench/messageShow';
```

Remove:

```ts
const { sendMessage, sendTargetedMessage, isSending } = useMessageMutations();
```

Add:

```ts
const { sendMessage, isSending } = useMessageMutations();
```

Remove `handleTargetedSend`.

Change the classes query return shape from:

```ts
return {
  id: c.id,
  class_number: Number(c.class_number ?? 0),
  class_name: c.name,
  entry_count: count ?? 0,
};
```

To:

```ts
return {
  id: c.id,
  label: buildMessageShowClassLabel({
    className: c.name,
    name: c.name,
  }),
  entryCount: count ?? 0,
};
```

Replace the modal render:

```tsx
{selectedShowId && (
  <ComposeTargetedModal
    open={showTargetedModal}
    onClose={() => setShowTargetedModal(false)}
    onSend={handleTargetedSend}
    classes={classes}
  />
)}
```

With:

```tsx
{selectedShowId && (
  <Dialog open={showTargetedModal} onOpenChange={isOpen => !isOpen && setShowTargetedModal(false)}>
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Message Show</DialogTitle>
      </DialogHeader>
      <MessageShowComposer
        showId={selectedShowId}
        classes={classes}
        showHistoryLink={false}
        onSent={() => setShowTargetedModal(false)}
      />
    </DialogContent>
  </Dialog>
)}
```

- [ ] **Step 4: Delete obsolete modal files if no imports remain**

Run:

```bash
rg "ComposeTargetedModal" apps/myk9show/src
```

If the only matches are the component and its test, delete:

```bash
git rm apps/myk9show/src/features/messages/components/ComposeTargetedModal.tsx apps/myk9show/src/features/messages/components/__tests__/ComposeTargetedModal.test.tsx
```

- [ ] **Step 5: Run Messages page tests**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/messages/pages/__tests__/SecretaryMessagesPage.test.tsx
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/features/messages/pages/SecretaryMessagesPage.tsx apps/myk9show/src/features/messages/pages/__tests__/SecretaryMessagesPage.test.tsx
git add -u apps/myk9show/src/features/messages/components
git commit -m "refactor(show): reuse message show composer in inbox"
```

## Task 7: Remove Obsolete Broadcast Card Surface

**Files:**
- Delete if unused:
  - `apps/myk9show/src/features/show-workbench/QuickBroadcastCard.tsx`
  - `apps/myk9show/src/features/show-workbench/ClassBroadcastCard.tsx`
  - `apps/myk9show/src/features/show-workbench/quickBroadcast.ts`
  - `apps/myk9show/src/features/show-workbench/classBroadcast.ts`
  - related tests that no longer exercise imported code

- [ ] **Step 1: Search for remaining imports**

Run:

```bash
rg "QuickBroadcastCard|ClassBroadcastCard|quickBroadcast|classBroadcast" apps/myk9show/src
```

Expected: only obsolete files/tests remain. If other production imports remain, update them to `MessageShowComposer` or `messageShow` before deleting.

- [ ] **Step 2: Delete unused files**

Run:

```bash
git rm apps/myk9show/src/features/show-workbench/QuickBroadcastCard.tsx apps/myk9show/src/features/show-workbench/ClassBroadcastCard.tsx apps/myk9show/src/features/show-workbench/quickBroadcast.ts apps/myk9show/src/features/show-workbench/classBroadcast.ts
git rm apps/myk9show/src/features/show-workbench/__tests__/QuickBroadcastCard.test.tsx apps/myk9show/src/features/show-workbench/__tests__/ClassBroadcastCard.test.tsx apps/myk9show/src/features/show-workbench/__tests__/quickBroadcast.test.ts apps/myk9show/src/features/show-workbench/__tests__/classBroadcast.test.ts
```

- [ ] **Step 3: Replace needed expiry helper before deleting `quickBroadcast.ts`**

If `MessageShowComposer.tsx` still imports `buildQuickBroadcastExpiresAt`, move this helper into `messageShow.ts` before deletion:

```ts
export function buildMessageShowAnnouncementExpiresAt(now = new Date()): string {
  return new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString();
}
```

Then update `MessageShowComposer.tsx`:

```ts
import { buildMessageShowAnnouncementExpiresAt } from './messageShow';
```

And:

```ts
expiresAt: buildMessageShowAnnouncementExpiresAt(),
```

- [ ] **Step 4: Run search again**

Run:

```bash
rg "QuickBroadcastCard|ClassBroadcastCard|quickBroadcast|classBroadcast" apps/myk9show/src
```

Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/features/show-workbench/MessageShowComposer.tsx apps/myk9show/src/features/show-workbench/messageShow.ts
git add -u apps/myk9show/src/features/show-workbench
git commit -m "refactor(show): remove obsolete broadcast cards"
```

## Task 8: Update Tracker And Run Verification

**Files:**
- Modify: `OPEN-TODOS.md`

- [ ] **Step 1: Mark todo complete**

In `OPEN-TODOS.md`, replace:

```md
- [ ] **Consolidate secretary show messaging into one Message Show composer** — Replace the Show Desk `Quick broadcast` and `Class broadcast` tools with one show-scoped `Message Show` composer that supports everyone-in-show, class, and checked-in recipients; keeps quick shortcuts such as lunch ready / results posted / report to gate; and reuses the same compose contract from `/secretary/messages?showId=...`. Design: [`docs/superpowers/specs/2026-06-01-message-show-consolidation-design.md`](docs/superpowers/specs/2026-06-01-message-show-consolidation-design.md).
```

With:

```md
- [x] ~~**Consolidate secretary show messaging into one Message Show composer**~~ — Show Desk now uses one `Message Show` composer for everyone-in-show, class, and checked-in recipients; quick shortcuts are consolidated; and `/secretary/messages?showId=...` reuses the same compose contract for show-scoped sends. Design: [`docs/superpowers/specs/2026-06-01-message-show-consolidation-design.md`](docs/superpowers/specs/2026-06-01-message-show-consolidation-design.md).
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
cd apps/myk9show && npx vitest run \
  src/features/show-workbench/__tests__/messageShow.test.ts \
  src/features/show-workbench/__tests__/MessageShowComposer.test.tsx \
  src/test/pages/secretary/ShowWorkbenchPage.test.tsx \
  src/features/messages/pages/__tests__/SecretaryMessagesPage.test.tsx
```

Expected: all pass.

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: `Tasks: ... successful` with no TypeScript errors.

- [ ] **Step 4: Run lint if production source changed**

Run:

```bash
pnpm lint
```

Expected: pass, or report pre-existing unrelated lint failures without fixing them in this commit.

- [ ] **Step 5: Record deployment requirements**

Because this plan changes `supabase/migrations/` and two edge functions, add this note to the PR body and release checklist:

```md
Deployment required after merge:
- Run `supabase db push` for `20260601161000_add_show_message_push_alert.sql`.
- Deploy `send-targeted-message` with `--no-verify-jwt`.
- Deploy `push-trigger-chat-message` with `--no-verify-jwt`.
- Re-test Message Show with push off and push on against stable staging.
```

Do not run these commands without explicit approval because they mutate shared Supabase resources.

- [ ] **Step 6: Commit tracker and verification cleanup**

```bash
git add OPEN-TODOS.md
git commit -m "docs(show): mark message show consolidation complete"
```

## Rollback And Recovery

- If the UI PR causes trouble before the migration is deployed, revert the PR; old Quick Broadcast/Class Broadcast code should be gone only after equivalent Message Show coverage passes.
- If the migration is deployed and needs rollback, keep the `push_alert` column in place unless it causes a confirmed production issue. The column is additive and defaults to `true`, so existing one-to-one chat push behavior remains compatible.
- If targeted push opt-in fails after deployment, set the UI checkbox path aside by reverting the composer PR while leaving the additive DB column. Then redeploy the previous `send-targeted-message` and `push-trigger-chat-message` functions.
- If push delivery fails but in-app messaging works, do not block secretary in-app sends. Record the push failure and continue with in-app delivery.

## Final Manual Verification

- [ ] Open a show workbench and open Show Desk tools.
- [ ] Confirm only **Message Show** appears; **Quick broadcast** and **Class broadcast** do not.
- [ ] Send `Lunch ready` to everyone without push and confirm it appears in the show feed.
- [ ] Send `Report to gate` to a class without push and confirm recipients see it in messages.
- [ ] Send one message with **Send push alert** enabled and confirm subscribed devices receive a lock-screen/browser notification.
- [ ] Open `/secretary/messages?showId=...` and confirm history/replies are available.
- [ ] Confirm the Messages page compose button opens **Message Show**, not **Message Exhibitors**.
