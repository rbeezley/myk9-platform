import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';
import { mapRowToClassInfo, useClassCheckInData } from '@/hooks/queries/useClassCheckInData';

// Minimal raw row matching the Supabase query shape
const baseRow = {
  id: 'entry-1',
  entry_status: 'checked-in',
  armband: '42',
  run_order: 7,
  handler_id: 'handler-1',
  dog: {
    id: 'dog-1',
    call_name: 'Storm',
    breed: 'Border Collie',
    sex: 'male',
    date_of_birth: '2021-03-15',
  },
  class: {
    id: 'class-1',
    name: 'Container Novice A',
    element: 'Container',
    level: 'Novice',
    max_entries: 30,
    ring_number: 2,
    start_time: '2026-05-03T09:00:00Z',
    judge_name: 'Ellen Heavner',
    trial: {
      id: 'trial-1',
      name: 'Scent Work Day 1',
      date: '2026-05-03',
      planned_start_time: '08:00',
      show: {
        id: 'show-1',
        name: 'Spring Classic',
        location: 'Main Hall',
      },
    },
  },
};

describe('mapRowToClassInfo', () => {
  it('maps class fields correctly', () => {
    const result = mapRowToClassInfo(baseRow);
    expect(result.class.id).toBe('class-1');
    expect(result.class.name).toBe('Container Novice A');
    expect(result.class.element).toBe('Container');
    expect(result.class.level).toBe('Novice');
    expect(result.class.maxEntries).toBe(30);
    expect(result.class.ringNumber).toBe(2);
    expect(result.class.startTime).toBe('2026-05-03T09:00:00Z');
    expect(result.class.judgeName).toBe('Ellen Heavner');
    expect(result.class.showId).toBe('show-1');
    expect(result.class.trialId).toBe('trial-1');
  });

  it('maps trial fields correctly', () => {
    const result = mapRowToClassInfo(baseRow);
    expect(result.trial.id).toBe('trial-1');
    expect(result.trial.name).toBe('Scent Work Day 1');
    expect(result.trial.date).toBe('2026-05-03');
    expect(result.trial.showId).toBe('show-1');
    expect(result.trial.location).toBe('Main Hall');
    expect(result.trial.startTime).toBe('08:00');
  });

  it('maps entry fields correctly', () => {
    const result = mapRowToClassInfo(baseRow);
    expect(result.entry.id).toBe('entry-1');
    expect(result.entry.armband).toBe('42');
    expect(result.entry.runningOrder).toBe(7);
    expect(result.entry.handlerId).toBe('handler-1');
    expect(result.entry.checkInStatus).toBe('checked-in');
    expect(result.entry.dogCallName).toBe('Storm');
    expect(result.entry.className).toBe('Container Novice A');
    expect(result.entry.ringNumber).toBe(2);
    expect(result.entry.judgeName).toBe('Ellen Heavner');
  });

  it('maps dog fields correctly', () => {
    const result = mapRowToClassInfo(baseRow);
    expect(result.entry.dog?.id).toBe('dog-1');
    expect(result.entry.dog?.breed).toBe('Border Collie');
    expect(result.entry.dog?.sex).toBe('male');
    expect(result.entry.dog?.callName).toBe('Storm');
  });

  it('builds minimal ringStatus stub', () => {
    const result = mapRowToClassInfo(baseRow);
    expect(result.ringStatus.classId).toBe('class-1');
    expect(result.ringStatus.ringNumber).toBe(2);
    expect(result.ringStatus.judgeName).toBe('Ellen Heavner');
    expect(result.ringStatus.onDeck).toEqual([]);
  });

  it('handles nullable fields with safe defaults', () => {
    const sparse = {
      ...baseRow,
      entry_status: null,
      armband: null,
      run_order: null,
      dog: { ...baseRow.dog, call_name: null, sex: null, date_of_birth: null },
      class: {
        ...baseRow.class,
        element: null,
        level: null,
        max_entries: null,
        ring_number: null,
        start_time: null,
        judge_name: null,
      },
    };
    const result = mapRowToClassInfo(sparse);
    expect(result.entry.armband).toBe('');
    expect(result.entry.checkInStatus).toBe('no-status');
    expect(result.entry.dogCallName).toBe('');
    expect(result.class.element).toBe('');
    expect(result.class.level).toBe('');
    expect(result.class.maxEntries).toBe(0);
    expect(result.class.ringNumber).toBe(0);
    expect(result.class.judgeName).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Hook tests
// ---------------------------------------------------------------------------

const { mockChain, mockFrom } = vi.hoisted(() => {
  const chain: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
  } = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
  };
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  const from = vi.fn().mockReturnValue(chain);
  return { mockChain: chain, mockFrom: from };
});

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    userWithRoles: { databaseUserId: 'user-123' },
  }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: createTestQueryClient() }, children);
}

describe('useClassCheckInData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChain.select = vi.fn().mockReturnValue(mockChain);
    mockChain.eq = vi.fn().mockReturnValue(mockChain);
    mockChain.maybeSingle = vi.fn();
    mockFrom.mockReturnValue(mockChain);
  });

  it('returns mapped ExhibitorClassInfo on success', async () => {
    mockChain.maybeSingle = vi.fn().mockResolvedValue({ data: baseRow, error: null });

    const { result } = renderHook(() => useClassCheckInData('entry-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).not.toBeNull();
    expect(result.current.data?.class.name).toBe('Container Novice A');
    expect(result.current.data?.entry.armband).toBe('42');
    expect(result.current.error).toBeNull();
  });

  it('returns null data when entry not found', async () => {
    mockChain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useClassCheckInData('missing-entry'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('surfaces error on Supabase failure', async () => {
    mockChain.maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'DB error' },
    });

    const { result } = renderHook(() => useClassCheckInData('entry-1'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });

    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('is disabled when entryId is empty', () => {
    const { result } = renderHook(() => useClassCheckInData(''), { wrapper });
    expect(result.current.isLoading).toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
