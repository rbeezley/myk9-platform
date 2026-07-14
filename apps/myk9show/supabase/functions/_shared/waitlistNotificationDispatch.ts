import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';

export type WaitlistNotificationEventType = 'offered' | 'reminder' | 'expired';

export interface QueuedWaitlistEvent {
  event_id: string;
  waitlist_entry_id: string;
  event_type: WaitlistNotificationEventType;
}

const DISPATCH_TIMEOUT_MS = 5_000;
const DISPATCH_CONCURRENCY = 3;

export async function dispatchWaitlistEvent(input: {
  supabase: SupabaseClient;
  supabaseUrl: string;
  pushWebhookSecret: string | undefined;
  waitlistEntryId: string;
  eventType: WaitlistNotificationEventType;
}): Promise<'dispatched' | 'not_configured' | 'error'> {
  const event = await enqueueWaitlistEvent(input);
  if (!event) return 'error';

  return invokeWaitlistDispatcher({
    supabaseUrl: input.supabaseUrl,
    pushWebhookSecret: input.pushWebhookSecret,
    eventId: event.event_id,
    waitlistEntryId: event.waitlist_entry_id,
    eventType: event.event_type,
  });
}

export async function enqueueWaitlistEvent(input: {
  supabase: SupabaseClient;
  waitlistEntryId: string;
  eventType: WaitlistNotificationEventType;
}): Promise<QueuedWaitlistEvent | null> {
  const { data: eventId, error: enqueueError } = await input.supabase.rpc(
    'enqueue_waitlist_notification_event',
    {
      p_waitlist_entry_id: input.waitlistEntryId,
      p_event_type: input.eventType,
    }
  );
  if (enqueueError || typeof eventId !== 'string') {
    console.error('waitlist notification enqueue failed', enqueueError?.message);
    return null;
  }
  return {
    event_id: eventId,
    waitlist_entry_id: input.waitlistEntryId,
    event_type: input.eventType,
  };
}

async function invokeWaitlistDispatcher(input: {
  supabaseUrl: string;
  pushWebhookSecret: string | undefined;
  eventId: string;
  waitlistEntryId: string;
  eventType: WaitlistNotificationEventType;
}): Promise<'dispatched' | 'not_configured' | 'error'> {
  if (!input.pushWebhookSecret) {
    console.error('PUSH_WEBHOOK_SECRET is missing; waitlist event remains pending');
    return 'not_configured';
  }

  try {
    const response = await fetch(`${input.supabaseUrl}/functions/v1/push-trigger-waitlist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.pushWebhookSecret}`,
      },
      body: JSON.stringify({
        event_id: input.eventId,
        waitlist_entry_id: input.waitlistEntryId,
        event_type: input.eventType,
      }),
      signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(`waitlist ${input.eventType} dispatch failed with status ${response.status}`);
      return 'error';
    }
    return 'dispatched';
  } catch {
    console.error(`waitlist ${input.eventType} dispatch request failed`);
    return 'error';
  }
}

export async function dispatchQueuedWaitlistEvents(input: {
  events: QueuedWaitlistEvent[];
  supabaseUrl: string;
  pushWebhookSecret: string | undefined;
}): Promise<{ dispatched: number; errors: string[] }> {
  const results = await mapWithConcurrency(
    input.events,
    DISPATCH_CONCURRENCY,
    async event => ({
      event,
      result: await invokeWaitlistDispatcher({
        supabaseUrl: input.supabaseUrl,
        pushWebhookSecret: input.pushWebhookSecret,
        eventId: event.event_id,
        waitlistEntryId: event.waitlist_entry_id,
        eventType: event.event_type,
      }),
    })
  );

  return results.reduce(
    (summary, item) => {
      if (item.result === 'dispatched') summary.dispatched++;
      else summary.errors.push(`Dispatch ${item.event.event_id}: ${item.result}`);
      return summary;
    },
    { dispatched: 0, errors: [] as string[] }
  );
}

export async function retryWaitlistNotificationEvents(input: {
  supabase: SupabaseClient;
  supabaseUrl: string;
  pushWebhookSecret: string | undefined;
}): Promise<{ dispatched: number; errors: string[] }> {
  const { data, error } = await input.supabase.rpc(
    'list_retryable_waitlist_notification_events',
    { p_limit: 10 }
  );
  if (error) return { dispatched: 0, errors: [`Fetch retries: ${error.message}`] };

  return dispatchQueuedWaitlistEvents({
    events: (data as QueuedWaitlistEvent[] | null) ?? [],
    supabaseUrl: input.supabaseUrl,
    pushWebhookSecret: input.pushWebhookSecret,
  });
}

export async function processHalfwayReminders(input: {
  supabase: SupabaseClient;
  supabaseUrl: string;
  pushWebhookSecret: string | undefined;
  now: Date;
}): Promise<{ sent: number; skippedMailIn: number; errors: string[] }> {
  const { data, error } = await input.supabase.rpc('enqueue_due_waitlist_reminder_events', {
    p_now: input.now.toISOString(),
    p_limit: 15,
  });
  if (error) {
    return { sent: 0, skippedMailIn: 0, errors: [`Enqueue reminders: ${error.message}`] };
  }

  const delivery = await dispatchQueuedWaitlistEvents({
    events: (data as QueuedWaitlistEvent[] | null) ?? [],
    supabaseUrl: input.supabaseUrl,
    pushWebhookSecret: input.pushWebhookSecret,
  });
  return { sent: delivery.dispatched, skippedMailIn: 0, errors: delivery.errors };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}
