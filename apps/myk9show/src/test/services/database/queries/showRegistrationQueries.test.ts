import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createShowRegistration,
  getRegistrationByShowAndHandler,
  getRegistrationByConfirmationNumber,
  getRegistrationsForShow,
  updateRegistrationPayment,
  getConfirmationNumbersForEntries,
} from '@/services/database/show-registrations';
import { mockSupabase, createChainableQuery } from '@/test/mocks/supabase';

const MOCK_DB_ROW = {
  id: 'reg-001',
  confirmation_number: 'MK9-000042',
  show_id: 'show-abc',
  handler_id: 'handler-xyz',
  payment_status: 'pending',
  payment_reference: null,
  notes: null,
  created_at: '2026-03-09T10:00:00Z',
  updated_at: '2026-03-09T10:00:00Z',
};

describe('show-registrations', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createShowRegistration', () => {
    it('creates a registration and returns mapped data', async () => {
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: MOCK_DB_ROW, error: null }));

      const result = await createShowRegistration('show-abc', 'handler-xyz');

      expect(result.error).toBeNull();
      expect(result.data).not.toBeNull();
      expect(result.data?.confirmationNumber).toBe('MK9-000042');
      expect(result.data?.showId).toBe('show-abc');
      expect(result.data?.handlerId).toBe('handler-xyz');
    });

    it('falls back to existing registration on unique violation (23505)', async () => {
      // First call (insert) fails with unique violation
      const insertQuery = createChainableQuery({
        data: null,
        error: { message: 'duplicate key', code: '23505' },
      });
      // Second call (select fallback) succeeds
      const selectQuery = createChainableQuery({ data: MOCK_DB_ROW, error: null });

      let callCount = 0;
      mockSupabase.from.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? insertQuery : selectQuery;
      });

      const result = await createShowRegistration('show-abc', 'handler-xyz');

      expect(result.error).toBeNull();
      expect(result.data).not.toBeNull();
      expect(result.data?.confirmationNumber).toBe('MK9-000042');
    });

    it('returns error on non-unique-violation database error', async () => {
      mockSupabase.from.mockReturnValue(
        createChainableQuery({
          data: null,
          error: { message: 'connection refused', code: 'CONNECTION_ERROR' },
        })
      );

      const result = await createShowRegistration('show-abc', 'handler-xyz');

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });

    it('passes payment reference when provided', async () => {
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: MOCK_DB_ROW, error: null }));

      const result = await createShowRegistration('show-abc', 'handler-xyz', 'pi_test123');

      expect(result.error).toBeNull();
      expect(result.data).not.toBeNull();
    });
  });

  describe('getRegistrationByShowAndHandler', () => {
    it('returns registration when found', async () => {
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: MOCK_DB_ROW, error: null }));

      const result = await getRegistrationByShowAndHandler('show-abc', 'handler-xyz');

      expect(result.error).toBeNull();
      expect(result.data?.confirmationNumber).toBe('MK9-000042');
    });

    it('returns null data when no registration exists', async () => {
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: null, error: null }));

      const result = await getRegistrationByShowAndHandler('show-abc', 'handler-new');

      expect(result.error).toBeNull();
      expect(result.data).toBeNull();
    });

    it('returns error on database failure', async () => {
      mockSupabase.from.mockReturnValue(
        createChainableQuery({
          data: null,
          error: { message: 'timeout', code: 'TIMEOUT' },
        })
      );

      const result = await getRegistrationByShowAndHandler('show-abc', 'handler-xyz');

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  describe('getRegistrationByConfirmationNumber', () => {
    it('returns registration for valid confirmation number', async () => {
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: MOCK_DB_ROW, error: null }));

      const result = await getRegistrationByConfirmationNumber('MK9-000042');

      expect(result.error).toBeNull();
      expect(result.data?.id).toBe('reg-001');
    });

    it('returns null for non-existent confirmation number', async () => {
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: null, error: null }));

      const result = await getRegistrationByConfirmationNumber('MK9-999999');

      expect(result.error).toBeNull();
      expect(result.data).toBeNull();
    });

    it('handles case-insensitive lookup (trims input)', async () => {
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: MOCK_DB_ROW, error: null }));

      const result = await getRegistrationByConfirmationNumber('  mk9-000042  ');

      expect(result.error).toBeNull();
      expect(result.data).not.toBeNull();
    });
  });

  describe('getRegistrationsForShow', () => {
    it('returns all registrations for a show', async () => {
      const mockRows = [
        { ...MOCK_DB_ROW, id: 'reg-001' },
        { ...MOCK_DB_ROW, id: 'reg-002', confirmation_number: 'MK9-000043' },
      ];
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockRows, error: null }));

      const result = await getRegistrationsForShow('show-abc');

      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(2);
      expect(result.data[0].id).toBe('reg-001');
      expect(result.data[1].confirmationNumber).toBe('MK9-000043');
    });

    it('returns empty array when show has no registrations', async () => {
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: [], error: null }));

      const result = await getRegistrationsForShow('show-empty');

      expect(result.error).toBeNull();
      expect(result.data).toEqual([]);
    });

    it('returns empty array with error on failure', async () => {
      mockSupabase.from.mockReturnValue(
        createChainableQuery({
          data: null,
          error: { message: 'forbidden', code: '403' },
        })
      );

      const result = await getRegistrationsForShow('show-abc');

      expect(result.data).toEqual([]);
      expect(result.error).toBeDefined();
    });
  });

  describe('updateRegistrationPayment', () => {
    it('updates payment status successfully', async () => {
      const updatedRow = { ...MOCK_DB_ROW, payment_status: 'paid', payment_reference: 'pi_abc' };
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: updatedRow, error: null }));

      const result = await updateRegistrationPayment('reg-001', 'paid', 'pi_abc');

      expect(result.error).toBeNull();
      expect(result.data?.paymentStatus).toBe('paid');
    });

    it('returns error on failure', async () => {
      mockSupabase.from.mockReturnValue(
        createChainableQuery({
          data: null,
          error: { message: 'not found', code: 'PGRST116' },
        })
      );

      const result = await updateRegistrationPayment('reg-nonexistent', 'paid');

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  describe('getConfirmationNumbersForEntries', () => {
    it('returns map of registration IDs to confirmation numbers', async () => {
      const mockRows = [
        { id: 'reg-001', confirmation_number: 'MK9-000001' },
        { id: 'reg-002', confirmation_number: 'MK9-000002' },
      ];
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockRows, error: null }));

      const result = await getConfirmationNumbersForEntries(['reg-001', 'reg-002']);

      expect(result.error).toBeNull();
      expect(result.data.get('reg-001')).toBe('MK9-000001');
      expect(result.data.get('reg-002')).toBe('MK9-000002');
    });

    it('returns empty map for empty input', async () => {
      const result = await getConfirmationNumbersForEntries([]);

      expect(result.error).toBeNull();
      expect(result.data.size).toBe(0);
    });

    it('deduplicates registration IDs', async () => {
      mockSupabase.from.mockReturnValue(
        createChainableQuery({
          data: [{ id: 'reg-001', confirmation_number: 'MK9-000001' }],
          error: null,
        })
      );

      const result = await getConfirmationNumbersForEntries(['reg-001', 'reg-001', 'reg-001']);

      expect(result.error).toBeNull();
      expect(result.data.size).toBe(1);
    });

    it('filters out falsy registration IDs', async () => {
      mockSupabase.from.mockReturnValue(
        createChainableQuery({
          data: [{ id: 'reg-001', confirmation_number: 'MK9-000001' }],
          error: null,
        })
      );

      const result = await getConfirmationNumbersForEntries(['', 'reg-001', '']);

      expect(result.error).toBeNull();
      expect(result.data.size).toBe(1);
    });

    it('returns empty map with error on failure', async () => {
      mockSupabase.from.mockReturnValue(
        createChainableQuery({
          data: null,
          error: { message: 'server error', code: '500' },
        })
      );

      const result = await getConfirmationNumbersForEntries(['reg-001']);

      expect(result.data.size).toBe(0);
      expect(result.error).toBeDefined();
    });
  });
});
