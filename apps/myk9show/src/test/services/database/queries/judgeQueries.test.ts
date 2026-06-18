import { describe, expect, it, vi, afterEach } from 'vitest';
import { getJudgesWithQualifications } from '@/services/database/judges';
import { createChainableQuery, mockSupabase } from '@/test/mocks/supabase';

describe('Judge queries', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getJudgesWithQualifications', () => {
    it('returns an account-less judge (qualifications, no user_roles grant)', async () => {
      // The defining trait of this row: judge_qualifications present, but NO
      // user_roles — i.e. a judge who never created an account. Option A means
      // they are still returned by the picker query.
      const mockData = [
        {
          id: 'judge-1',
          first_name: 'Ada',
          last_name: 'Judge',
          judge_qualifications: [{ id: 'qualification-1', organization: 'AKC' }],
        },
      ];

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const result = await getJudgesWithQualifications();

      expect(mockSupabase.from).toHaveBeenCalledWith('people');
      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
    });

    it('gates on judge_qualifications, NOT on a user_roles judge grant', async () => {
      const chain = createChainableQuery({ data: [], error: null });
      mockSupabase.from.mockReturnValue(chain);

      await getJudgesWithQualifications();

      // The select must inner-join judge_qualifications (the source of truth) and
      // must NOT reference user_roles — the prior gate that hid account-less judges.
      const selectArg = (chain as unknown as { select: { mock: { calls: unknown[][] } } })
        .select.mock.calls[0][0] as string;
      expect(selectArg).toContain('judge_qualifications!inner');
      expect(selectArg).not.toContain('user_roles');

      // No residual .eq filters on user_roles.is_active / user_roles.roles.name.
      const eqMock = (chain as unknown as { eq: { mock: { calls: unknown[][] } } }).eq;
      expect(eqMock.mock.calls).toHaveLength(0);
    });

    it('returns a judge database error when the query fails', async () => {
      mockSupabase.from.mockReturnValue(
        createChainableQuery({ data: null, error: { message: 'permission denied' } })
      );

      const result = await getJudgesWithQualifications();

      expect(result.data).toEqual([]);
      expect(result.error).toMatchObject({
        table: 'judge',
        operation: 'select_with_qualifications',
      });
    });
  });
});
