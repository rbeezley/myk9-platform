import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createChainableQuery, mockSupabase } from '@/test/mocks/supabase';
import {
  fetchClassRulesForTemplate,
  prewarmClassRulesCache,
} from '@/services/sportTemplateService';

describe('sportTemplateService rule fetches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not query sport_class_rules for local fallback template ids', async () => {
    const rules = await fetchClassRulesForTemplate('akc-scent-work-official-2024');

    expect(rules).toEqual([]);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('does not prewarm local fallback template ids', () => {
    prewarmClassRulesCache(['akc-scent-work-official-2024']);

    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('queries sport_class_rules for database-backed template ids', async () => {
    const query = createChainableQuery({ data: [], error: null });
    mockSupabase.from.mockReturnValue(query);

    await fetchClassRulesForTemplate('11111111-1111-4111-8111-111111111111');

    expect(mockSupabase.from).toHaveBeenCalledWith('sport_class_rules');
  });
});
