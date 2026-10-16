import { describe, expect, it } from 'vitest';
import { mapDatabaseToDog } from './dogMappers';
import { normalizeRegistration } from '@/services/replication/dogRegistrationWrites';

const registration = {
  organization: 'AKC',
  registeredName: 'Willow Tree',
  number: 'N123',
  type: 'Labrador Retriever',
  status: 'Pending',
  registrationDate: '2026-09-23',
};

describe('registration calendar date (MYK9-1117)', () => {
  it('keeps the supplied date in the offline placeholder', () => {
    expect(normalizeRegistration(registration, '2026-10-15T00:00:00Z')).toMatchObject({
      registrationDate: '2026-09-23',
    });
  });
  it('keeps an omitted date empty', () => {
    expect(
      normalizeRegistration(
        { ...registration, registrationDate: undefined },
        '2026-10-15T00:00:00Z'
      ).registrationDate
    ).toBeNull();
  });
  it.each(['registration_date', 'registrationDate'])(
    'restores the %s date after online or replica read',
    key => {
      const dog = mapDatabaseToDog({
        id: 'dog-1',
        call_name: 'Willow',
        owner_id: 'owner-1',
        registrations: [
          { id: 'r1', organization: 'AKC', registration_number: 'N123', [key]: '2026-09-23' },
        ],
      });
      expect(dog.registrations?.[0]?.registrationDate).toBe('2026-09-23');
    }
  );
});
