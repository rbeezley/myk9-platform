/**
 * MYK9-90 sections 4-5 — the storage shape of a dog's identity.
 *
 * After the section-5 migrations, `dogs.call_name` is NOT NULL and `dogs.name`
 * is a nullable legacy alias that nothing writes for new dogs. These tests pin
 * the two halves of that contract at the mapper boundary:
 *
 *   read  — a row with `name = NULL` must still produce a non-blank `Dog.name`,
 *           so no surface that renders `dog.name` goes blank;
 *   write — no create or update path may put the call name back into
 *           `dogs.name`, which is what produced the duplicated identity storage
 *           this change removes.
 */
import { describe, it, expect } from 'vitest';
import {
  mapDatabaseToDog,
  mapDogInputToInsert,
  mapDogInputToReplicated,
  mapDogInputToUpdate,
} from '@/services/mappers/dogMappers';
import type { DogInput } from '@/types/dog-types';

describe('dog identity mapping (MYK9-90 §4-5)', () => {
  describe('reads', () => {
    it('falls back to the call name when the legacy dogs.name is null', () => {
      const dog = mapDatabaseToDog({
        id: 'dog-1',
        name: null,
        call_name: 'Tera',
        breed: 'Border Collie',
        owner_id: 'owner-1',
      });

      expect(dog.name).toBe('Tera');
      expect(dog.callName).toBe('Tera');
    });

    it('keeps a legacy dogs.name when one is present', () => {
      const dog = mapDatabaseToDog({
        id: 'dog-1',
        name: 'Maia TeraByte Van Neerland',
        call_name: 'Tera',
        breed: 'Border Collie',
        owner_id: 'owner-1',
      });

      expect(dog.name).toBe('Maia TeraByte Van Neerland');
      expect(dog.callName).toBe('Tera');
    });

    it('never yields undefined for name, even with neither column set', () => {
      const dog = mapDatabaseToDog({ id: 'dog-1', breed: 'Border Collie' });
      expect(dog.name).toBe('');
    });
  });

  describe('writes', () => {
    const input: DogInput = {
      name: 'Maia TeraByte Van Neerland',
      callName: 'Tera',
      breed: 'Border Collie',
      sex: 'female',
      ownerId: 'owner-1',
    } as DogInput;

    it('never inserts a name into the legacy column', () => {
      const insert = mapDogInputToInsert(input);
      expect(insert.name).toBeNull();
      expect(insert.call_name).toBe('Tera');
    });

    it('never updates the legacy column, even when a name is supplied', () => {
      const update = mapDogInputToUpdate(input);
      expect(update).not.toHaveProperty('name');
      expect(update.call_name).toBe('Tera');
    });

    // MYK9-90 §5.1 — `dogs.call_name` is NOT NULL after 20260727110000. Every
    // write path must supply one; none may send null. These fired only once the
    // generated types were regenerated to match the migrated schema, which is
    // why they are pinned here rather than left to typecheck.
    it('falls back to the name when only one name was supplied', () => {
      const insert = mapDogInputToInsert({ ...input, callName: undefined } as DogInput);
      expect(insert.call_name).toBe('Maia TeraByte Van Neerland');
    });

    it('refuses to insert a dog with no name at all rather than sending null', () => {
      expect(() =>
        mapDogInputToInsert({ ...input, name: '', callName: '' } as unknown as DogInput)
      ).toThrow(/call name/i);
    });

    // MYK9-90 §5.1 — the whitespace case specifically. `"   "` is truthy, so it
    // survived every `||` fallback in earlier rounds and was only normalised to
    // empty at the payload builder, downstream of the local write.
    it.each([
      ['both whitespace', '   ', '  '],
      ['call name whitespace, no legacy name', '   ', ''],
    ])('refuses a whitespace-only call name (%s)', (_label, callName, name) => {
      expect(() =>
        mapDogInputToInsert({ ...input, callName, name } as unknown as DogInput)
      ).toThrow(/call name/i);
      expect(() =>
        mapDogInputToReplicated({ ...input, callName, name } as unknown as DogInput, 'dog-1')
      ).toThrow(/call name/i);
    });

    it('trims the call name it persists', () => {
      const insert = mapDogInputToInsert({ ...input, callName: '  Tera  ' });
      expect(insert.call_name).toBe('Tera');

      const replicated = mapDogInputToReplicated({ ...input, callName: '  Tera  ' }, 'dog-1');
      expect(replicated.callName).toBe('Tera');
    });

    it('never clears the call name on update', () => {
      const update = mapDogInputToUpdate({ ...input, callName: '' });
      expect(update).not.toHaveProperty('call_name');
      // The rest of the edit still goes through — a blank call-name field must
      // not fail a save that was changing something else.
      expect(update.breed).toBe('Border Collie');
    });
  });
});
