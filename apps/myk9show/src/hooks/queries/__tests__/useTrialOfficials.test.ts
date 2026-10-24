import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { createTestQueryClient } from '@/test/utils/testUtils';
import { useTrialOfficials } from '../useTrialOfficials';

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

function peopleStub(result: { data: unknown; error?: unknown }) {
  const chain = { select: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue(result) };
  return chain;
}

const personRow = (id: string, first: string, last: string, phone: string | null) => ({
  id,
  first_name: first,
  last_name: last,
  street_address: null,
  city: null,
  state: null,
  zip_code: null,
  phone,
  email: `${first.toLowerCase()}@example.com`,
});

describe('useTrialOfficials', () => {
  beforeEach(() => {
    fromMock.mockReset();
    rpcMock.mockReset();
  });

  it('does not fetch when disabled', () => {
    const { result } = renderHook(() => useTrialOfficials('show-1', false), {
      wrapper: createWrapper(),
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('resolves the chairman and secretary from show_officials + people', async () => {
    rpcMock.mockResolvedValue({
      data: [
        { user_id: 'p-chair', role: 'chairman', email: null },
        { user_id: 'p-sec', role: 'secretary', email: null },
        { user_id: 'p-other', role: 'treasurer', email: null },
      ],
      error: null,
    });
    const people = peopleStub({
      data: [
        personRow('p-chair', 'Casey', 'Chair', '555-0100'),
        personRow('p-sec', 'Sam', 'Sec', null),
      ],
    });
    fromMock.mockReturnValue(people);

    const { result } = renderHook(() => useTrialOfficials('show-1', true), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rpcMock).toHaveBeenCalledWith('get_show_officials', { p_show_id: 'show-1' });
    expect(people.in).toHaveBeenCalledWith('id', ['p-chair', 'p-sec']);
    expect(result.current.data?.chairperson).toMatchObject({
      name: 'Casey Chair',
      phone: '555-0100',
      email: 'casey@example.com',
    });
    expect(result.current.data?.secretary).toMatchObject({ name: 'Sam Sec', phone: null });
  });

  it('returns both officials null (and reads no people) when none is named', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(() => useTrialOfficials('show-1', true), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ chairperson: null, secretary: null });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('errors, rather than resolving blank, when the RPC fails', async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error('rpc failed') });

    const { result } = renderHook(() => useTrialOfficials('show-1', true), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('errors when the people read fails', async () => {
    rpcMock.mockResolvedValue({
      data: [{ user_id: 'p-chair', role: 'chairman', email: null }],
      error: null,
    });
    fromMock.mockReturnValue(peopleStub({ data: null, error: new Error('people failed') }));

    const { result } = renderHook(() => useTrialOfficials('show-1', true), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
