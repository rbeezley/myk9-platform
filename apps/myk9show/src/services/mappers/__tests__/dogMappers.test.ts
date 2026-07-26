import { describe, expect, it } from 'vitest';
import { mapDatabaseToDog } from '../dogMappers';

describe('mapDatabaseToDog', () => {
  it('preserves registration identity ordering fields for official paperwork', () => {
    const dog = mapDatabaseToDog({
      id: 'dog-1',
      name: 'Tera',
      call_name: 'Tera',
      breed: null,
      sex: 'female',
      owner_id: 'person-1',
      registrations: [
        {
          id: 'registration-z',
          organization: 'AKC',
          registration_number: 'DN-LATER',
          registered_name: 'Later Registration',
          breed: 'Belgian Tervuren',
          variety: 'Longhaired',
          is_primary: false,
          created_at: '2026-05-01T00:00:00Z',
        },
        {
          id: 'registration-a',
          organization: 'AKC (American Kennel Club)',
          registration_number: 'DN-EARLIER',
          registered_name: 'Earlier Registration',
          breed: 'Belgian Tervuren',
          variety: 'Longhaired',
          is_primary: true,
          created_at: '2026-02-01T00:00:00Z',
        },
      ],
    });

    expect(dog.registrations).toEqual([
      expect.objectContaining({
        id: 'registration-z',
        variety: 'Longhaired',
        isPrimary: false,
        createdAt: '2026-05-01T00:00:00Z',
      }),
      expect.objectContaining({
        id: 'registration-a',
        variety: 'Longhaired',
        isPrimary: true,
        createdAt: '2026-02-01T00:00:00Z',
      }),
    ]);
  });
});
