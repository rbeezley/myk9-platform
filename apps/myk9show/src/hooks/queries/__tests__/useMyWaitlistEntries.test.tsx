/**
 * MYK9-417 (Codex review). The hook serves TWO numbers that look alike: the
 * display list, which a `?waitlistOffer=` deep link can extend with a terminal
 * offer so its expiry can be explained, and the count of positions the
 * exhibitor actually HOLDS, which My Shows puts on its Waitlist chip. Collapsing
 * them tells an exhibitor they are queued for a spot they have just lost.
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const rows = vi.hoisted(() => ({
  active: [] as unknown[],
  focused: null as unknown,
}));

function makeRow(id: string, status: string, position: number) {
  return {
    id,
    class_id: `class-${id}`,
    position,
    status,
    offered_at: null,
    offer_expires_at: null,
    promoted_entry_id: null,
    created_at: '2026-09-01T12:00:00.000Z',
    classes: { name: 'Interior Advanced', trials: { shows: { name: 'Heartland' } } },
    dogs: { name: 'Juni', call_name: 'Juni' },
    exhibitor_profiles: { people: { first_name: 'Test', last_name: 'User' } },
  };
}

vi.mock('@/services/database/supabaseClient', () => {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = vi.fn(chain);
  builder.eq = vi.fn(chain);
  builder.in = vi.fn(chain);
  // The active list resolves through `.order()`; the focused single row
  // through `.maybeSingle()`. Two terminators, so one builder serves both.
  builder.order = vi.fn(() => Promise.resolve({ data: rows.active, error: null }));
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: rows.focused, error: null }));
  builder.delete = vi.fn(chain);
  return { supabase: { from: vi.fn(() => builder), functions: { invoke: vi.fn() } } };
});

import { useMyWaitlistEntries } from '../useMyWaitlistEntries';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useMyWaitlistEntries active position count', () => {
  beforeEach(() => {
    rows.active = [];
    rows.focused = null;
  });

  it('counts the positions the exhibitor holds', async () => {
    rows.active = [makeRow('w1', 'waiting', 1), makeRow('w2', 'offered', 2)];

    const { result } = renderHook(() => useMyWaitlistEntries('exhibitor-1'), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.entries).toHaveLength(2));
    expect(result.current.activePositionCount).toBe(2);
  });

  it('shows a deep-linked expired offer without counting it as a position', async () => {
    rows.focused = makeRow('w-dead', 'expired', 3);

    const { result } = renderHook(() => useMyWaitlistEntries('exhibitor-1', 'w-dead'), {
      wrapper: wrapper(),
    });

    // The row reaches the display list so the section can explain it...
    await waitFor(() => expect(result.current.entries).toHaveLength(1));
    // ...and never the count My Shows puts on the Waitlist chip.
    expect(result.current.activePositionCount).toBe(0);
  });
});
