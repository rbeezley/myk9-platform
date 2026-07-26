import { describe, expect, it } from 'vitest';
import { mapDatabaseToDog, mapReplicatedDogToDbRow } from '../dogMappers';

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

describe('mapReplicatedDogToDbRow', () => {
  it('carries the deceased date through to the offline read', () => {
    // This adapter is the whole offline read path: IndexedDB row -> db-row shape
    // -> `mapDatabaseToDog`. A field it drops is a field the offline read cannot
    // show, however faithfully replication stored it — which is how `deceasedDate`
    // came back `undefined` and the next edit sent `deceased_date: null` to the
    // server.
    const dog = mapDatabaseToDog(
      mapReplicatedDogToDbRow({
        id: 'dog-1',
        name: 'Bandit',
        callName: 'Bandit',
        breed: 'Border Collie',
        status: 'deceased',
        deceasedDate: '2026-07-01',
      })
    );

    expect(dog.status).toBe('deceased');
    expect(dog.deceasedDate).toBe('2026-07-01');
  });
});
