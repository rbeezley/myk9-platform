import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, createTestQueryClient, renderHook } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/queryClient';
import type { User } from '@/types/user-types';
import { PREMIUM_JUDGE_AFFILIATIONS_KEY } from '@/services/database/judges/judgeAffiliations';
import { useUpdateUserMutation } from './useUsersQuery';
import { useUpdatePerson } from '../useUsers';

const usersMocks = vi.hoisted(() => ({
  updateUser: vi.fn(),
}));

vi.mock('@/services/database/users', () => usersMocks);
vi.mock('@/services/database/judges/judgeAffiliations', () => ({
  PREMIUM_JUDGE_AFFILIATIONS_KEY: 'premiumJudgeAffiliations',
}));
vi.mock('@/services/database/supabaseClient', () => ({ supabase: { rpc: vi.fn() } }));
vi.mock('@/services/rbac', () => ({ rbacService: {} }));
vi.mock('@/services/LoggingService', () => ({ logger: { error: vi.fn() } }));

const qualification = {
  organization: 'ASCA',
  judgeNumber: '123',
} as unknown as NonNullable<User['judgeQualifications']>[number];

describe('useUpdateUserMutation after a judge edit (MYK9-2292)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The save returns a plain `people` row: no roles, no qualifications.
    usersMocks.updateUser.mockResolvedValue({
      data: { id: 'p1', first_name: 'Jane', last_name: 'Judge', judge_affiliation: 'Region 4' },
      error: null,
    });
  });

  async function save(queryClient = createTestQueryClient()) {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUpdateUserMutation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'p1', updates: { phone: '555-0100' } });
    });
    return queryClient;
  }

  it('keeps the cached roles and qualifications that make the person a judge', async () => {
    const queryClient = createTestQueryClient();
    const cached = {
      id: 'p1',
      firstName: 'Jane',
      lastName: 'Judge',
      roles: ['judge'],
      judgeQualifications: [qualification],
    } as unknown as User;
    queryClient.setQueryData(queryKeys.users.detail('p1'), cached);
    queryClient.setQueryData(queryKeys.users.all, [cached]);

    await save(queryClient);

    const detail = queryClient.getQueryData<User>(queryKeys.users.detail('p1'));
    expect(detail?.roles).toEqual(['judge']);
    expect(detail?.judgeQualifications).toEqual([qualification]);
    expect(detail?.judgeAffiliation).toBe('Region 4');
    const list = queryClient.getQueryData<User[]>(queryKeys.users.all);
    expect(list?.[0]?.roles).toEqual(['judge']);
    expect(list?.[0]?.judgeQualifications).toEqual([qualification]);
  });

  it('re-reads the premium checklist affiliations', async () => {
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await save(queryClient);

    expect(invalidate).toHaveBeenCalledWith({ queryKey: [PREMIUM_JUDGE_AFFILIATIONS_KEY] });
  });
});

describe('useUpdatePerson (MYK9-2292)', () => {
  it('re-reads the premium checklist affiliations after a person save', async () => {
    usersMocks.updateUser.mockResolvedValue({
      data: { id: 'p1', first_name: 'Jane', last_name: 'Judge' },
      error: null,
    });
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUpdatePerson(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id: 'p1',
        firstName: 'Jane',
        lastName: 'Judge',
      } as User);
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: [PREMIUM_JUDGE_AFFILIATIONS_KEY] });
  });
});
