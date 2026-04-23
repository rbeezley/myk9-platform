import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useExampleIds } from '../hooks/useExampleIds';

vi.mock('@/lib/supabase', () => {
  const fromMock = vi.fn();
  return {
    supabase: {
      from: fromMock,
    },
    __fromMock: fromMock,
  };
});

import * as supabaseModule from '@/lib/supabase';

const getFromMock = () =>
  (supabaseModule as unknown as { __fromMock: ReturnType<typeof vi.fn> }).__fromMock;

function makeSelectChain(result: { data: unknown; error: null | Error }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const limit = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ limit });
  return { select };
}

const wrapper =
  (client: QueryClient) =>
  ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

describe('useExampleIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ids for every table when queries succeed', async () => {
    const mocks: Record<string, unknown> = {
      shows: { id: 'SHOW_1' },
      trials: { id: 'TRIAL_1', show_id: 'SHOW_1' },
      classes: { id: 'CLASS_1', trial_id: 'TRIAL_1', show_id: 'SHOW_1' },
      dogs: { id: 'DOG_1' },
      clubs: { id: 'CLUB_1' },
      roles: { id: 'ROLE_1' },
      organization_templates: { id: 'TEMPLATE_1' },
      people: { id: 'PERSON_1' },
      entries: { id: 'ENTRY_1' },
      show_registrations: { id: 'REG_1' },
      profiles: { id: 'USER_1' },
    };
    getFromMock().mockImplementation((table: string) =>
      makeSelectChain({ data: mocks[table] ?? null, error: null })
    );

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(() => useExampleIds(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      showId: 'SHOW_1',
      trialId: 'TRIAL_1',
      trialShowId: 'SHOW_1',
      classId: 'CLASS_1',
      classTrialId: 'TRIAL_1',
      classShowId: 'SHOW_1',
      dogId: 'DOG_1',
      clubId: 'CLUB_1',
      roleId: 'ROLE_1',
      templateId: 'TEMPLATE_1',
      personId: 'PERSON_1',
      entryId: 'ENTRY_1',
      registrationId: 'REG_1',
      userId: 'USER_1',
    });
  });

  it('returns undefined for tables that are empty (maybeSingle null)', async () => {
    getFromMock().mockImplementation(() => makeSelectChain({ data: null, error: null }));

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(() => useExampleIds(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.showId).toBeUndefined();
    expect(result.current.data?.dogId).toBeUndefined();
  });
});
