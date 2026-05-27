/**
 * Tests for useClassRealtime Hook
 *
 * Focuses on the display_order fall-through guard added for PR #214:
 * status-only UPDATEs MUST stay on the optimistic fast path, and the
 * reorder fall-through MUST only fire when `payload.old` actually carries
 * `display_order` (i.e., REPLICA IDENTITY FULL). Otherwise every UPDATE
 * triggers refetch during scoring, which is a ringside perf regression.
 */

import { renderHook } from '@testing-library/react';
import { vi, type Mock } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useClassRealtime } from './useClassRealtime';
import type { ClassEntry } from '../types';

type RealtimeHandler = (payload: {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
}) => void;

interface MockChannel {
  on: Mock;
  subscribe: Mock;
  unsubscribe: Mock;
  /** Handler registered for the `classes` table. */
  classesHandler: RealtimeHandler | null;
}

function createMockSupabase(): { client: SupabaseClient; channel: MockChannel } {
  const channel: MockChannel = {
    on: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    classesHandler: null,
  };

  // First `.on` call is for the `classes` table — capture its handler.
  // Second `.on` call is for the `entries` table — capture too for completeness.
  channel.on.mockImplementation((_event: string, config: { table: string }, handler: RealtimeHandler) => {
    if (config.table === 'classes') {
      channel.classesHandler = handler;
    }
    return channel;
  });
  channel.subscribe.mockReturnValue(channel);

  const client = {
    channel: vi.fn().mockReturnValue(channel),
  } as unknown as SupabaseClient;

  return { client, channel };
}

const baseClass: ClassEntry = {
  id: 1,
  trial_id: 1,
  element: 'Container',
  level: 'Novice',
  section: 'A',
  class_name: 'Novice A Container',
  class_order: 1,
  judge_name: 'Judge Smith',
  entry_count: 0,
  completed_count: 0,
  class_status: 'no-status',
  is_scoring_finalized: false,
  is_favorite: false,
  trial_date: '2025-01-20',
  trial_number: 1,
  dogs: [],
} as ClassEntry;

function renderUseClassRealtime() {
  const { client, channel } = createMockSupabase();
  const setClasses = vi.fn();
  const refetch = vi.fn();

  renderHook(() =>
    useClassRealtime(1, 'license-key', setClasses, refetch, client)
  );

  return { client, channel, setClasses, refetch };
}

describe('useClassRealtime — display_order fall-through guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('status-only UPDATE stays on optimistic path (no refetch)', () => {
    const { channel, setClasses, refetch } = renderUseClassRealtime();
    expect(channel.classesHandler).toBeTruthy();

    // Simulate the realistic REPLICA IDENTITY DEFAULT payload: `old` only
    // carries the PK; `new` carries the full row including display_order.
    channel.classesHandler!({
      eventType: 'UPDATE',
      new: {
        id: 1,
        class_status: 'in_progress',
        is_scoring_finalized: false,
        display_order: 5,
      },
      old: { id: 1 },
    });

    expect(refetch).not.toHaveBeenCalled();
    expect(setClasses).toHaveBeenCalledTimes(1);
  });

  it('UPDATE without display_order on payload.old (RI DEFAULT) does NOT refetch even if new.display_order is numeric', () => {
    const { channel, setClasses, refetch } = renderUseClassRealtime();

    // This is the bug from the review: post-migration-136 every row has a
    // numeric `display_order`, so without the `oldHasDisplayOrder` guard
    // this branch would refetch on every status change.
    channel.classesHandler!({
      eventType: 'UPDATE',
      new: {
        id: 1,
        class_status: 'completed',
        is_scoring_finalized: true,
        display_order: 7,
      },
      old: { id: 1 }, // RI DEFAULT — display_order key NOT present
    });

    expect(refetch).not.toHaveBeenCalled();
    expect(setClasses).toHaveBeenCalledTimes(1);
  });

  it('UPDATE with differing display_order on payload.old (RI FULL) DOES refetch', () => {
    const { channel, setClasses, refetch } = renderUseClassRealtime();

    // Forward-compatible: when/if `classes` is set to REPLICA IDENTITY FULL,
    // payload.old carries the full prior row. A genuine reorder must
    // fall through to refetch so q-side picks up the new run order.
    channel.classesHandler!({
      eventType: 'UPDATE',
      new: {
        id: 1,
        class_status: 'no-status',
        is_scoring_finalized: false,
        display_order: 9,
      },
      old: {
        id: 1,
        class_status: 'no-status',
        is_scoring_finalized: false,
        display_order: 3,
      },
    });

    expect(refetch).toHaveBeenCalledTimes(1);
    expect(setClasses).not.toHaveBeenCalled();
  });

  it('UPDATE with same display_order on payload.old (RI FULL) stays on optimistic path', () => {
    const { channel, setClasses, refetch } = renderUseClassRealtime();

    // Status-only UPDATE under RI FULL: old carries display_order but it
    // matches new. Must NOT refetch.
    channel.classesHandler!({
      eventType: 'UPDATE',
      new: {
        id: 1,
        class_status: 'in_progress',
        is_scoring_finalized: false,
        display_order: 4,
      },
      old: {
        id: 1,
        class_status: 'no-status',
        is_scoring_finalized: false,
        display_order: 4,
      },
    });

    expect(refetch).not.toHaveBeenCalled();
    expect(setClasses).toHaveBeenCalledTimes(1);
  });

  it('optimistic setClasses updater applies status to the matching row', () => {
    const { channel, setClasses } = renderUseClassRealtime();

    channel.classesHandler!({
      eventType: 'UPDATE',
      new: {
        id: 1,
        class_status: 'in_progress',
        is_scoring_finalized: false,
        display_order: 1,
      },
      old: { id: 1 },
    });

    // Invoke the functional updater that was passed to setClasses.
    const updater = setClasses.mock.calls[0][0] as (prev: ClassEntry[]) => ClassEntry[];
    const next = updater([baseClass, { ...baseClass, id: 2 }]);

    expect(next[0].class_status).toBe('in_progress');
    expect(next[1].class_status).toBe('no-status');
  });

  it('INSERT triggers refetch (no optimistic path)', () => {
    const { channel, refetch } = renderUseClassRealtime();

    channel.classesHandler!({
      eventType: 'INSERT',
      new: { id: 99, class_status: 'no-status', display_order: 10 },
      old: null,
    });

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('DELETE triggers refetch (no optimistic path)', () => {
    const { channel, refetch } = renderUseClassRealtime();

    channel.classesHandler!({
      eventType: 'DELETE',
      new: null,
      old: { id: 1 },
    });

    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
