import { describe, expect, it } from 'vitest';
import { friendlySaveError } from '@/utils/friendlySaveError';
import {
  dogSaveFailure,
  dogSaveMessage,
  matchDogDbError,
  rethrownDogDbError,
} from './translateDogDbError';

const GENERIC = 'Your changes are still here. Try again.';

describe('dog save failures: only known translations are branded', () => {
  it.each([
    ['network TypeError', new TypeError('Failed to fetch')],
    [
      'PostgREST plain object',
      { code: 'PGRST204', message: "Could not find the 'x' column of 'dogs'" },
    ],
    ['JWT expired', { code: 'PGRST301', message: 'JWT expired' }],
    ['AbortError', Object.assign(new Error('aborted'), { name: 'AbortError' })],
  ])(
    'an unrecognised %s keeps the generic Try again message at every dog call site',
    (_name, error) => {
      // Add and Edit Registration reject with dogSaveFailure; delete and inline
      // registration toast dogSaveMessage; the dog store rethrows rethrownDogDbError.
      expect(friendlySaveError(dogSaveFailure(error)).description).toBe(GENERIC);
      expect(dogSaveMessage(error)).toBe("We couldn't save that. Try again.");
      expect(matchDogDbError(error)).toBeNull();
      expect(rethrownDogDbError(error)).toBe(error);
    }
  );

  it.each([
    [
      'microchip conflict',
      {
        code: '23505',
        message: 'duplicate key value violates unique constraint "dogs_microchip_number_key"',
      },
      'A dog with this microchip number already exists.',
    ],
    [
      'registration conflict',
      {
        code: '23505',
        message:
          'duplicate key value violates unique constraint "dog_registrations_live_org_number_unique"',
      },
      'A dog with this registration number already exists.',
    ],
  ])('a known %s still shows its translated sentence', (_name, error, sentence) => {
    expect(friendlySaveError(dogSaveFailure(error)).description).toContain(sentence);
    expect(dogSaveMessage(error)).toContain(sentence);
    expect((rethrownDogDbError(error) as Error).message).toBe(sentence);
  });
});
