import { describe, expect, it, vi, afterEach } from 'vitest';
import { getJudgesWithQualifications } from '@/services/database/judges';
import { createChainableQuery, mockSupabase } from '@/test/mocks/supabase';

describe('Judge queries', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getJudgesWithQualifications', () => {
    it('fetches active judges with their qualifications', async () => {
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
