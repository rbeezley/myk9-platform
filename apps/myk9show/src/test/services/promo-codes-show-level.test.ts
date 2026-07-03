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

describe('promo-codes', () => {
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

      const { getPromoCodesByShow } = await import('@/services/database/promo-codes');
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

      const { getPromoCodesByTrial } = await import('@/services/database/promo-codes');
      const result = await getPromoCodesByTrial('trial-1');

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
    });
  });

  // SA-002: exhibitor validation now goes through the validate_promo_code RPC
  // (SECURITY DEFINER) instead of a direct catalog SELECT. The RPC returns a
  // single row: { valid, promo_code_id, discount_type, discount_value, reason }.
  describe('validatePromoCodeForEntry', () => {
    it('returns valid for a code the RPC accepts', async () => {
      mockSupabase.rpc.mockReturnValue(
        createChainableQuery({
          data: [
            {
              valid: true,
              promo_code_id: 'pc-1',
              discount_type: 'percentage',
              discount_value: 15,
              reason: null,
            },
          ],
          error: null,
        })
      );

      const { validatePromoCodeForEntry } = await import('@/services/database/promo-codes');
      const result = await validatePromoCodeForEntry('trial-1', 'show-1', 'VALID');

      expect(mockSupabase.rpc).toHaveBeenCalledWith('validate_promo_code', {
        p_code: 'VALID',
        p_trial_id: 'trial-1',
        p_show_id: 'show-1',
      });
      expect(result.valid).toBe(true);
      expect(result.promoCode?.id).toBe('pc-1');
      expect(result.promoCode?.discount_type).toBe('percentage');
      expect(result.promoCode?.discount_value).toBe(15);
    });

    it('surfaces the RPC reason for an expired code', async () => {
      mockSupabase.rpc.mockReturnValue(
        createChainableQuery({
          data: [
            {
              valid: false,
              promo_code_id: null,
              discount_type: null,
              discount_value: null,
              reason: 'This promo code has expired',
            },
          ],
          error: null,
        })
      );

      const { validatePromoCodeForEntry } = await import('@/services/database/promo-codes');
      const result = await validatePromoCodeForEntry('trial-1', 'show-1', 'EXPIRED');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('This promo code has expired');
    });

    it('surfaces the RPC reason for an exhausted code', async () => {
      mockSupabase.rpc.mockReturnValue(
        createChainableQuery({
          data: [
            {
              valid: false,
              promo_code_id: null,
              discount_type: null,
              discount_value: null,
              reason: 'This promo code has reached its usage limit',
            },
          ],
          error: null,
        })
      );

      const { validatePromoCodeForEntry } = await import('@/services/database/promo-codes');
      const result = await validatePromoCodeForEntry('trial-1', 'show-1', 'EXHAUSTED');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('This promo code has reached its usage limit');
    });

    it('returns invalid when the RPC finds no code', async () => {
      mockSupabase.rpc.mockReturnValue(
        createChainableQuery({
          data: [
            {
              valid: false,
              promo_code_id: null,
              discount_type: null,
              discount_value: null,
              reason: 'Invalid promo code',
            },
          ],
          error: null,
        })
      );

      const { validatePromoCodeForEntry } = await import('@/services/database/promo-codes');
      const result = await validatePromoCodeForEntry('trial-1', 'show-1', 'NONEXIST');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid promo code');
    });
  });

  describe('calculatePromoDiscount', () => {
    it('calculates percentage discount', async () => {
      const { calculatePromoDiscount } = await import('@/services/database/promo-codes');
      expect(calculatePromoDiscount('percentage', 50, 100)).toBe(50);
      expect(calculatePromoDiscount('percentage', 100, 80)).toBe(80);
    });

    it('calculates flat discount capped at entry fee', async () => {
      const { calculatePromoDiscount } = await import('@/services/database/promo-codes');
      expect(calculatePromoDiscount('flat', 10, 100)).toBe(10);
      expect(calculatePromoDiscount('flat', 200, 100)).toBe(100);
    });
  });
});
