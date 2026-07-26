import { describe, expect, it } from 'vitest';
import { resolveDogIdentityForOrganization, resolveDogIdentity } from '../index';
import { mapDatabaseToDog } from '@/services/mappers/dogMappers';
import { getDogBreedLabel, BREED_NOT_SET } from '@/types/dog-types';
import { toScoringEntry } from '@/pages/scoring/types';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';

/**
 * MYK9-90 — the general negative.
 *
 * Every finding in review round 2 was the same shape: the resolver correctly
 * answered "this dog has no breed for that organization", and something
 * downstream answered anyway — a `??` chain, a lossy mapping, or a caller that
 * handed the resolver nothing to work with.
 *
 * These tests assert the negative through the FULL path (resolver → mapper →
 * label / scoring row), not from the resolver in isolation. The resolver being
 * right has never been the bug.
 *
 * The fixture is the live multi-organization dog: a UKC registration whose
 * breed differs from the AKC one, plus a legacy `dogs.breed` and a stale
 * denormalized `dog_breed` on the entry — every value that has historically
 * leaked onto an AKC surface.
 */

const UKC_ONLY_DOG_ROW = {
  id: 'dog-ukc-only',
  name: 'Ziva',
  call_name: 'Ziva',
  // The legacy column. Still present in the schema, must never be read.
  breed: 'Mixed Breed',
  registrations: [
    {
      id: 'reg-ukc',
      created_at: '2024-01-01T00:00:00Z',
      organization: 'UKC (United Kennel Club)',
      registered_name: 'Ziva of the North',
      registration_number: 'P935-254',
      breed: 'Belgian Shepherd Dog',
    },
  ],
};

describe('a UKC-only dog never contributes a breed to an AKC-scoped surface', () => {
  it('resolves to nothing for AKC (baseline)', () => {
    const identity = resolveDogIdentityForOrganization(UKC_ONLY_DOG_ROW.registrations, 'AKC');
    expect(identity.breed).toBeNull();
    expect(identity.registrationNumber).toBeNull();
  });

  it('yields a BLANK scoring row breed even though the dog and entry both carry one', () => {
    // This is the P1: `loadRegisteredBreedsByDogId` returns `null` for a dog
    // with no AKC registration, and `toScoringEntry` must not fall through that
    // null to `dog.breed` / `entry.dogBreed` / `entry.dog_breed`.
    const entry: ReplicatedEntry = {
      id: 'entry-1',
      classId: 'class-1',
      dogId: 'dog-ukc-only',
      dog_call_name: 'Ziva',
      dog_breed: 'Belgian Shepherd Dog',
      dogBreed: 'Belgian Shepherd Dog',
      handler: 'Sam Handler',
      armband: '14',
      status: 'accepted',
    };

    const scoringEntry = toScoringEntry(
      entry,
      { id: 'dog-ukc-only', name: 'Ziva', callName: 'Ziva', breed: 'Mixed Breed' },
      0,
      // Explicit absence from the organization-scoped lookup.
      null
    );

    expect(scoringEntry.breed).toBe('');
    expect(scoringEntry.breed).not.toContain('Belgian');
    expect(scoringEntry.breed).not.toContain('Mixed Breed');
    // And no substitute placeholder sneaks in.
    expect(scoringEntry.breed).not.toBe('Unknown Breed');
  });

  it('still falls back for callers that did NO organization-scoped resolution', () => {
    // `undefined` is a different input from `null` and must keep its old
    // behavior, or every un-scoped ringside surface goes blank.
    const entry: ReplicatedEntry = {
      id: 'entry-1',
      classId: 'class-1',
      dogId: 'dog-ukc-only',
      dog_breed: 'Belgian Shepherd Dog',
      handler: 'Sam Handler',
      armband: '14',
      status: 'accepted',
    };
    expect(toScoringEntry(entry, null, 0).breed).toBe('Belgian Shepherd Dog');
  });

  it('never renders the legacy dogs.breed through the mapper + label path', () => {
    const dog = mapDatabaseToDog(UKC_ONLY_DOG_ROW);
    // Generic surface: the dog's single (UKC) registration answers.
    expect(dog.breed).toBe('Belgian Shepherd Dog');
    expect(getDogBreedLabel(dog)).toBe('Belgian Shepherd Dog');
    // The legacy value is gone from every derived shape.
    expect(dog.registrations?.[0]?.breed).toBe('Belgian Shepherd Dog');
    expect(JSON.stringify(dog)).not.toContain('Mixed Breed');
  });

  it('shows the not-set affordance, not a guess, for a dog with no registration at all', () => {
    const dog = mapDatabaseToDog({ ...UKC_ONLY_DOG_ROW, registrations: [] });
    expect(dog.breed).toBe('');
    expect(getDogBreedLabel(dog)).toBe(BREED_NOT_SET);
  });
});

describe('mapped registrations keep the resolver ordering fields', () => {
  // The P1 in `dogMappers`: `getDogBreedLabel` re-resolves from the MAPPED
  // registrations. If the mapping drops `created_at`/`is_primary`, the
  // comparator silently falls back to ordering by `id` — so this fixture is
  // built so id order and created_at order DISAGREE.
  const row = {
    id: 'dog-multi',
    name: 'Ziva',
    call_name: 'Ziva',
    breed: 'Mixed Breed',
    registrations: [
      {
        // Lexicographically FIRST id, but created LAST.
        id: 'aaa-late',
        created_at: '2025-01-01T00:00:00Z',
        organization: 'UKC',
        breed: 'Belgian Shepherd Dog',
        registration_number: 'P935-254',
      },
      {
        // Lexicographically LAST id, but created FIRST — this one is primary.
        id: 'zzz-early',
        created_at: '2024-01-01T00:00:00Z',
        organization: 'AKC',
        breed: 'Belgian Malinois',
        registration_number: 'DN61191906',
      },
    ],
  };

  it('agrees with the raw resolver instead of ordering by id', () => {
    const expected = resolveDogIdentity(row.registrations).breed;
    expect(expected).toBe('Belgian Malinois');

    const dog = mapDatabaseToDog(row);
    expect(dog.breed).toBe('Belgian Malinois');
    // The label re-resolves from `dog.registrations`; it must not disagree.
    expect(getDogBreedLabel(dog)).toBe(expected);
  });

  it('honours an explicit is_primary flag through the mapping', () => {
    const dog = mapDatabaseToDog({
      ...row,
      registrations: [{ ...row.registrations[0], is_primary: true }, { ...row.registrations[1] }],
    });
    expect(getDogBreedLabel(dog)).toBe('Belgian Shepherd Dog');
  });

  it('reads camelCase ordering fields from the offline replica shape', () => {
    // `loadRegistrationsMap` merges snake_case PostgREST rows with camelCase
    // rows from IndexedDB. Both must order identically.
    const dog = mapDatabaseToDog({
      ...row,
      registrations: [
        { id: 'aaa-late', createdAt: '2025-01-01T00:00:00Z', breed: 'Belgian Shepherd Dog' },
        { id: 'zzz-early', createdAt: '2024-01-01T00:00:00Z', breed: 'Belgian Malinois' },
      ],
    });
    expect(getDogBreedLabel(dog)).toBe('Belgian Malinois');
  });
});
