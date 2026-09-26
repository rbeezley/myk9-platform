import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { createTestQueryClient } from '@/test/utils/testUtils';
import { useUKCTrialReportContext } from '../useUKCTrialReportContext';

const fromMock = vi.fn();
const rpcMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

function createWrapper() {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

function tableStub(result: { data: unknown; error?: unknown }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  // `.in(...)` resolves directly (no `.maybeSingle()` call) for the people read.
  chain.in = vi.fn().mockResolvedValue(result);
  return chain;
}

describe('useUKCTrialReportContext', () => {
  beforeEach(() => {
    fromMock.mockReset();
    rpcMock.mockReset();
  });

  it('does not fetch when disabled', () => {
    const { result } = renderHook(() => useUKCTrialReportContext('show-1', false), {
      wrapper: createWrapper(),
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('assembles venue location, club number, and both officials from real rows', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'shows') {
        return tableStub({ data: { city: 'Springfield', state: 'IL', club_id: 'club-1' } });
      }
      if (table === 'clubs') {
        return tableStub({ data: { club_number: 'UKC-4821' } });
      }
      if (table === 'people') {
        return tableStub({
          data: [
            {
              id: 'chair-1',
              first_name: 'Alex',
              last_name: 'Chairperson',
              street_address: '1 Chair Way',
              city: 'Springfield',
              state: 'IL',
              zip_code: '62701',
              phone: '2175551000',
              email: null,
            },
            {
              id: 'sec-1',
              first_name: 'Sam',
              last_name: 'Secretary',
              street_address: '2 Secretary Ave',
              city: 'Decatur',
              state: 'IL',
              zip_code: '62521',
              phone: '2175552000',
              email: 'secretary@example.com',
            },
          ],
        });
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    rpcMock.mockResolvedValue({
      data: [
        { user_id: 'chair-1', role: 'chairman', email: 'chair-rpc@example.com' },
        { user_id: 'sec-1', role: 'secretary', email: 'sec-rpc@example.com' },
      ],
      error: null,
    });

    const { result } = renderHook(() => useUKCTrialReportContext('show-1', true), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      venueCity: 'Springfield',
      venueState: 'IL',
      clubNumber: 'UKC-4821',
      chairperson: {
        name: 'Alex Chairperson',
        streetAddress: '1 Chair Way',
        city: 'Springfield',
        state: 'IL',
        zipCode: '62701',
        phone: '2175551000',
        // The RPC's email is the fallback only when `people.email` is null.
        email: 'chair-rpc@example.com',
      },
      secretary: {
        name: 'Sam Secretary',
        streetAddress: '2 Secretary Ave',
        city: 'Decatur',
        state: 'IL',
        zipCode: '62521',
        phone: '2175552000',
        email: 'secretary@example.com',
      },
    });
  });

  it('leaves an official null when no one holds that role, rather than guessing', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'shows') {
        return tableStub({ data: { city: null, state: null, club_id: null } });
      }
      if (table === 'people') {
        return tableStub({ data: [] });
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    rpcMock.mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(() => useUKCTrialReportContext('show-1', true), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      venueCity: null,
      venueState: null,
      clubNumber: null,
      chairperson: null,
      secretary: null,
    });
  });
});
