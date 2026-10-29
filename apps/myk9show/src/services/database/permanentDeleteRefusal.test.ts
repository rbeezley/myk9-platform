import { describe, expect, it } from 'vitest';

import {
  DATABASE_BUSY_REFUSAL_MESSAGE,
  STRIPE_LEDGER_REFUSAL_MESSAGE,
  permanentDeleteRefusalMessage,
} from './permanentDeleteRefusal';

const fk = (constraint: string, table: string) =>
  `update or delete on table "${table}" violates foreign key constraint "${constraint}" on table "x"`;

describe('permanentDeleteRefusalMessage (MYK9-750)', () => {
  it('passes guard-authored sentences through', () => {
    expect(permanentDeleteRefusalMessage({ code: 'MK001', message: 'Delete dogs first.' })).toBe(
      'Delete dogs first.'
    );
    // hard_delete_show's unused-show refusals (MYK9-1472), Stripe orders included.
    expect(
      permanentDeleteRefusalMessage({ code: 'MK615', message: 'This show has 1 Stripe order(s).' })
    ).toBe('This show has 1 Stripe order(s).');
    expect(
      permanentDeleteRefusalMessage({
        code: 'MK615',
        message: 'This show has entries or enrollments, so it cannot be permanently deleted.',
      })
    ).toBe('This show has entries or enrollments, so it cannot be permanently deleted.');
  });

  it('says nothing changed when a lock conflict stopped the delete (MYK9-1472)', () => {
    for (const code of ['55P03', '40P01']) {
      expect(permanentDeleteRefusalMessage({ code, message: 'deadlock detected' })).toBe(
        DATABASE_BUSY_REFUSAL_MESSAGE
      );
    }
  });

  it('names the Stripe ledger only for the ledger foreign keys', () => {
    for (const constraint of ['stripe_orders_enrollment_id_fkey', 'stripe_orders_show_id_fkey']) {
      expect(
        permanentDeleteRefusalMessage({ code: '23503', message: fk(constraint, 'enrollments') })
      ).toBe(STRIPE_LEDGER_REFUSAL_MESSAGE);
    }
  });

  it('does not call an unrelated foreign key a Stripe refusal', () => {
    expect(
      permanentDeleteRefusalMessage({
        code: '23503',
        message: fk('secretary_tasks_created_by_fkey', 'people'),
      })
    ).toBeNull();
    expect(permanentDeleteRefusalMessage({ code: '42501', message: 'denied' })).toBeNull();
    expect(permanentDeleteRefusalMessage({ code: 'MK001' })).toBeNull();
    expect(permanentDeleteRefusalMessage(null)).toBeNull();
  });
});
