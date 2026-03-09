import { describe, it, expect } from 'vitest';
import {
  mapDbToRegistration,
  mapDbToRegistrationArray,
} from '@/services/mappers/registrationMappers';
import type { DbRegistration } from '@/types/registration-types';

const makeDbRow = (overrides: Partial<DbRegistration> = {}): DbRegistration => ({
  id: 'reg-001',
  confirmation_number: 'MK9-000001',
  show_id: 'show-abc',
  handler_id: 'handler-xyz',
  payment_status: 'pending',
  payment_reference: null,
  notes: null,
  created_at: '2026-03-09T10:00:00Z',
  updated_at: '2026-03-09T10:00:00Z',
  ...overrides,
});

describe('registrationMappers', () => {
  describe('mapDbToRegistration', () => {
    it('maps all required fields correctly', () => {
      const row = makeDbRow();
      const result = mapDbToRegistration(row);

      expect(result.id).toBe('reg-001');
      expect(result.confirmationNumber).toBe('MK9-000001');
      expect(result.showId).toBe('show-abc');
      expect(result.handlerId).toBe('handler-xyz');
      expect(result.paymentStatus).toBe('pending');
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it('maps payment_reference to paymentReference when present', () => {
      const row = makeDbRow({ payment_reference: 'pi_abc123' });
      const result = mapDbToRegistration(row);
      expect(result.paymentReference).toBe('pi_abc123');
    });

    it('maps null payment_reference to undefined', () => {
      const row = makeDbRow({ payment_reference: null });
      const result = mapDbToRegistration(row);
      expect(result.paymentReference).toBeUndefined();
    });

    it('maps notes when present', () => {
      const row = makeDbRow({ notes: 'VIP handler' });
      const result = mapDbToRegistration(row);
      expect(result.notes).toBe('VIP handler');
    });

    it('maps null notes to undefined', () => {
      const row = makeDbRow({ notes: null });
      const result = mapDbToRegistration(row);
      expect(result.notes).toBeUndefined();
    });

    it('converts date strings to Date objects', () => {
      const row = makeDbRow({
        created_at: '2026-01-15T08:30:00Z',
        updated_at: '2026-02-20T14:45:00Z',
      });
      const result = mapDbToRegistration(row);

      expect(result.createdAt.toISOString()).toBe('2026-01-15T08:30:00.000Z');
      expect(result.updatedAt.toISOString()).toBe('2026-02-20T14:45:00.000Z');
    });

    it('maps all payment status variants', () => {
      for (const status of ['pending', 'paid', 'refunded', 'waived'] as const) {
        const row = makeDbRow({ payment_status: status });
        const result = mapDbToRegistration(row);
        expect(result.paymentStatus).toBe(status);
      }
    });
  });

  describe('mapDbToRegistrationArray', () => {
    it('maps an empty array', () => {
      expect(mapDbToRegistrationArray([])).toEqual([]);
    });

    it('maps multiple rows', () => {
      const rows = [
        makeDbRow({ id: 'r1', confirmation_number: 'MK9-000001' }),
        makeDbRow({ id: 'r2', confirmation_number: 'MK9-000002' }),
        makeDbRow({ id: 'r3', confirmation_number: 'MK9-000003' }),
      ];
      const result = mapDbToRegistrationArray(rows);

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('r1');
      expect(result[1].confirmationNumber).toBe('MK9-000002');
      expect(result[2].id).toBe('r3');
    });
  });
});
