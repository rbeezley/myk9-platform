/** MYK9-982: the hook reports why an ended entry blocks re-entry, and a live entry outranks it. */
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const rows = vi.hoisted(() => ({ data: [] as Array<Record<string, unknown>> }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ is: async () => ({ data: rows.data, error: null }) }),
      }),
    }),
  },
}));
vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { useExistingEntries } from './useExistingEntries';

const row = (overrides: Record<string, unknown>) => ({
  id: 'e1',
  dog_id: 'dog-1',
  class_id: 'class-1',
  registration_id: 'r1',
  entry_status: 'withdrawn',
  check_in_status: 'none',
  payment_status: 'refunded',
  ...overrides,
});

describe('useExistingEntries — withdrawn re-entry (MYK9-982)', () => {
  it('reports "Withdrawn from this class" without calling the dog already entered', async () => {
    rows.data = [row({})];
    const { result } = renderHook(() => useExistingEntries('show-1'));

    await waitFor(() =>
      expect(result.current.getReEntryBlockReason('dog-1', 'class-1')).toBe(
        'Withdrawn from this class'
      )
    );
    expect(result.current.checkIfDogEnteredInClass('dog-1', 'class-1')).toBe(false);
    expect(result.current.getReEntryBlockReason('dog-1', 'other-class')).toBeNull();
  });

  it('a live entry added by hand outranks the withdrawn row', async () => {
    rows.data = [row({}), row({ id: 'e2', entry_status: 'confirmed', payment_status: 'paid' })];
    const { result } = renderHook(() => useExistingEntries('show-1'));

    await waitFor(() =>
      expect(result.current.checkIfDogEnteredInClass('dog-1', 'class-1')).toBe(true)
    );
    expect(result.current.getReEntryBlockReason('dog-1', 'class-1')).toBeNull();
  });
});
