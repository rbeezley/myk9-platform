import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  dispatchWaitlistEvent,
  dispatchQueuedWaitlistEvents,
  processHalfwayReminders,
  retryWaitlistNotificationEvents,
} from './waitlistNotificationDispatch';

function supabaseWithEvent(eventId: string | null, error: { message: string } | null = null) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: eventId, error }),
  } as unknown as SupabaseClient;
}

describe('dispatchWaitlistEvent', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('enqueues the durable event before invoking the dedicated dispatcher', async () => {
    const supabase = supabaseWithEvent('00000000-0000-4000-8000-000000000003');
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await dispatchWaitlistEvent({
      supabase,
      supabaseUrl: 'https://project.supabase.co',
      pushWebhookSecret: 'dedicated-secret',
      waitlistEntryId: '00000000-0000-4000-8000-000000000002',
      eventType: 'reminder',
    });

    expect(supabase.rpc).toHaveBeenCalledWith('enqueue_waitlist_notification_event', {
      p_waitlist_entry_id: '00000000-0000-4000-8000-000000000002',
      p_event_type: 'reminder',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://project.supabase.co/functions/v1/push-trigger-waitlist',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer dedicated-secret' }),
        signal: expect.any(AbortSignal),
        body: JSON.stringify({
          event_id: '00000000-0000-4000-8000-000000000003',
          waitlist_entry_id: '00000000-0000-4000-8000-000000000002',
          event_type: 'reminder',
        }),
      })
    );
    expect(result).toBe('dispatched');
  });

  it('leaves the event pending when the dedicated secret is unavailable', async () => {
    const supabase = supabaseWithEvent('00000000-0000-4000-8000-000000000003');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await dispatchWaitlistEvent({
      supabase,
      supabaseUrl: 'https://project.supabase.co',
      pushWebhookSecret: undefined,
      waitlistEntryId: '00000000-0000-4000-8000-000000000002',
      eventType: 'expired',
    });

    expect(result).toBe('not_configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('processHalfwayReminders', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('dispatches only the atomic database batch of new due reminder events', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          event_id: '00000000-0000-4000-8000-000000000003',
          waitlist_entry_id: '00000000-0000-4000-8000-000000000002',
          event_type: 'reminder',
        },
      ],
      error: null,
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      processHalfwayReminders({
        supabase: { rpc } as unknown as SupabaseClient,
        supabaseUrl: 'https://project.supabase.co',
        pushWebhookSecret: 'dedicated-secret',
        now: new Date('2026-07-14T01:00:00Z'),
      })
    ).resolves.toEqual({ sent: 1, skippedMailIn: 0, errors: [] });
    expect(rpc).toHaveBeenCalledWith('enqueue_due_waitlist_reminder_events', {
      p_now: '2026-07-14T01:00:00.000Z',
      p_limit: 15,
    });
  });
});

describe('retryWaitlistNotificationEvents', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reuses stranded durable events without creating a second event', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          event_id: '00000000-0000-4000-8000-000000000003',
          waitlist_entry_id: '00000000-0000-4000-8000-000000000002',
          event_type: 'offered',
        },
      ],
      error: null,
    });
    const supabase = { rpc } as unknown as SupabaseClient;
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      retryWaitlistNotificationEvents({
        supabase,
        supabaseUrl: 'https://project.supabase.co',
        pushWebhookSecret: 'dedicated-secret',
      })
    ).resolves.toEqual({ dispatched: 1, errors: [] });
    expect(rpc).toHaveBeenCalledWith('list_retryable_waitlist_notification_events', {
      p_limit: 10,
    });
    expect(rpc).not.toHaveBeenCalledWith('enqueue_waitlist_notification_event', expect.anything());
  });
});

describe('dispatchQueuedWaitlistEvents', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('bounds provider calls to three concurrent requests', async () => {
    let active = 0;
    let maximumActive = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      active++;
      maximumActive = Math.max(maximumActive, active);
      await new Promise(resolve => setTimeout(resolve, 1));
      active--;
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const events = Array.from({ length: 7 }, (_, index) => ({
      event_id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      waitlist_entry_id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      event_type: 'offered' as const,
    }));

    await expect(
      dispatchQueuedWaitlistEvents({
        events,
        supabaseUrl: 'https://project.supabase.co',
        pushWebhookSecret: 'dedicated-secret',
      })
    ).resolves.toEqual({ dispatched: 7, errors: [] });
    expect(maximumActive).toBe(3);
  });
});
