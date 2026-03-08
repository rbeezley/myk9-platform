/**
 * Tests for show-level promo code support (Phase 2 changes).
 * Covers: types, mappers, queries, and validation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabase, createChainableQuery } from '../mocks/supabase';
import {
  mapDbPromoCodeToApp,
  mapAppPromoCodeToDbInsert,
} from '@/services/mappers/promoCodeMappers';
import type { PromoCodeFormData } from '@/types/promo-codes';

// Reset supabase mock before each test
beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Mapper Tests ────────────────────────────────────────────────

describe('promoCodeMappers', () => {
  describe('mapDbPromoCodeToApp', () => {
    it('maps show-scoped code correctly', () => {
      const db = {
        id: 'pc-1',
        show_id: 'show-1',
        trial_id: null,
        code: 'SHOWCODE',
        discount_type: 'percentage',
        discount_value: 20,
        usage_limit: 100,
        usage_count: 5,
        expires_at: null,
        created_by: 'user-1',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      const result = mapDbPromoCodeToApp(db);
      expect(result.show_id).toBe('show-1');
      expect(result.trial_id).toBeNull();
      expect(result.code).toBe('SHOWCODE');
      expect(result.discount_type).toBe('percentage');
    });

    it('maps trial-scoped code correctly', () => {
      const db = {
        id: 'pc-2',
        show_id: null,
        trial_id: 'trial-1',
        code: 'TRIALCODE',
        discount_type: 'flat',
        discount_value: 10,
        usage_limit: null,
        usage_count: 0,
        expires_at: '2026-12-31T00:00:00Z',
        created_by: 'user-1',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };

      const result = mapDbPromoCodeToApp(db);
      expect(result.show_id).toBeNull();
      expect(result.trial_id).toBe('trial-1');
      expect(result.discount_type).toBe('flat');
    });
  });

  describe('mapAppPromoCodeToDbInsert', () => {
    const form: PromoCodeFormData = {
      code: 'testcode',
      discount_type: 'percentage',
      discount_value: 25,
      usage_limit: 50,
      expires_at: null,
    };

    it('creates show-scoped insert', () => {
      const result = mapAppPromoCodeToDbInsert(form, { showId: 'show-1' }, 'user-1');
      expect(result.show_id).toBe('show-1');
      expect(result.trial_id).toBeNull();
      expect(result.code).toBe('TESTCODE');
      expect(result.created_by).toBe('user-1');
    });

    it('creates trial-scoped insert', () => {
      const result = mapAppPromoCodeToDbInsert(form, { trialId: 'trial-1' }, 'user-1');
      expect(result.show_id).toBeNull();
      expect(result.trial_id).toBe('trial-1');
    });

    it('uppercases the code', () => {
      const result = mapAppPromoCodeToDbInsert(
        { ...form, code: 'lowercase' },
        { showId: 'show-1' },
        'user-1'
      );
      expect(result.code).toBe('LOWERCASE');
    });
  });
});

// ─── Query Tests ─────────────────────────────────────────────────

describe('promoCodeQueries', () => {
  describe('getPromoCodesByShow', () => {
    it('queries by show_id', async () => {
      const mockData = [
        {
          id: 'pc-1',
          show_id: 'show-1',
          code: 'SHOW10',
          discount_type: 'percentage',
          discount_value: 10,
        },
      ];
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const { getPromoCodesByShow } = await import('@/services/database/queries/promoCodeQueries');
      const result = await getPromoCodesByShow('show-1');

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(mockSupabase.from).toHaveBeenCalledWith('promo_codes');
    });
  });

  describe('getPromoCodesByTrial', () => {
    it('queries by trial_id', async () => {
      const mockData = [
        {
          id: 'pc-2',
          trial_id: 'trial-1',
          code: 'TRIAL20',
          discount_type: 'flat',
          discount_value: 20,
        },
      ];
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const { getPromoCodesByTrial } = await import('@/services/database/queries/promoCodeQueries');
      const result = await getPromoCodesByTrial('trial-1');

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
    });
  });

  describe('findPromoCodeByCode', () => {
    it('returns trial-level code when found', async () => {
      const trialCode = {
        id: 'pc-1',
        trial_id: 'trial-1',
        show_id: null,
        code: 'SAVE10',
        discount_type: 'percentage',
        discount_value: 10,
        usage_limit: null,
        usage_count: 0,
        expires_at: null,
        created_by: 'user-1',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      };

      // Single query returns array of matches; trial-level should be preferred
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: [trialCode], error: null }));

      const { findPromoCodeByCode } = await import('@/services/database/queries/promoCodeQueries');
      const result = await findPromoCodeByCode('trial-1', 'show-1', 'SAVE10');

      expect(result.data).toEqual(trialCode);
      expect(result.error).toBeNull();
    });

    it('falls back to show-level code when trial-level not found', async () => {
      const showCode = {
        id: 'pc-2',
        trial_id: null,
        show_id: 'show-1',
        code: 'SHOWWIDE',
        discount_type: 'flat',
        discount_value: 5,
        usage_limit: 100,
        usage_count: 3,
        expires_at: null,
        created_by: 'user-1',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      };

      // Single query returns only show-level match (no trial-level match)
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: [showCode], error: null }));

      const { findPromoCodeByCode } = await import('@/services/database/queries/promoCodeQueries');
      const result = await findPromoCodeByCode('trial-1', 'show-1', 'SHOWWIDE');

      expect(result.data).toEqual(showCode);
      expect(result.error).toBeNull();
    });
  });

  describe('validatePromoCodeForEntry', () => {
    it('returns valid for a non-expired code with remaining usage', async () => {
      const code = {
        id: 'pc-1',
        trial_id: null,
        show_id: 'show-1',
        code: 'VALID',
        discount_type: 'percentage',
        discount_value: 15,
        usage_limit: 100,
        usage_count: 5,
        expires_at: '2099-12-31T00:00:00Z',
        created_by: 'user-1',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      };

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: [code], error: null }));

      const { validatePromoCodeForEntry } =
        await import('@/services/database/queries/promoCodeQueries');
      const result = await validatePromoCodeForEntry('trial-1', 'show-1', 'VALID');

      expect(result.valid).toBe(true);
      expect(result.promoCode?.code).toBe('VALID');
      expect(result.promoCode?.show_id).toBe('show-1');
    });

    it('returns invalid for an expired code', async () => {
      const code = {
        id: 'pc-2',
        trial_id: 'trial-1',
        show_id: null,
        code: 'EXPIRED',
        discount_type: 'flat',
        discount_value: 10,
        usage_limit: null,
        usage_count: 0,
        expires_at: '2020-01-01T00:00:00Z',
        created_by: 'user-1',
        created_at: '2020-01-01',
        updated_at: '2020-01-01',
      };

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: [code], error: null }));

      const { validatePromoCodeForEntry } =
        await import('@/services/database/queries/promoCodeQueries');
      const result = await validatePromoCodeForEntry('trial-1', 'show-1', 'EXPIRED');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('This promo code has expired');
    });

    it('returns invalid for an exhausted code', async () => {
      const code = {
        id: 'pc-3',
        trial_id: null,
        show_id: 'show-1',
        code: 'EXHAUSTED',
        discount_type: 'percentage',
        discount_value: 50,
        usage_limit: 10,
        usage_count: 10,
        expires_at: null,
        created_by: 'user-1',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      };

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: [code], error: null }));

      const { validatePromoCodeForEntry } =
        await import('@/services/database/queries/promoCodeQueries');
      const result = await validatePromoCodeForEntry('trial-1', 'show-1', 'EXHAUSTED');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('This promo code has reached its usage limit');
    });

    it('returns invalid when no code found', async () => {
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: [], error: null }));

      const { validatePromoCodeForEntry } =
        await import('@/services/database/queries/promoCodeQueries');
      const result = await validatePromoCodeForEntry('trial-1', 'show-1', 'NONEXIST');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid promo code');
    });
  });

  describe('calculateDiscount', () => {
    it('calculates percentage discount', async () => {
      const { calculateDiscount } = await import('@/services/database/queries/promoCodeQueries');
      expect(calculateDiscount('percentage', 50, 100)).toBe(50);
      expect(calculateDiscount('percentage', 100, 80)).toBe(80);
    });

    it('calculates flat discount capped at entry fee', async () => {
      const { calculateDiscount } = await import('@/services/database/queries/promoCodeQueries');
      expect(calculateDiscount('flat', 10, 100)).toBe(10);
      expect(calculateDiscount('flat', 200, 100)).toBe(100);
    });
  });
});
