import { describe, expect, it } from 'vitest';
import {
  translateClubIdentityError,
  translatePersonIdentityError,
} from './duplicateIdentityErrors';

describe('duplicate identity error translation', () => {
  it('translates club normalized-name unique conflicts', () => {
    const error = translateClubIdentityError({
      code: '23505',
      message: 'duplicate key value violates unique constraint "clubs_live_normalized_name_unique"',
    });

    expect(error.message).toBe('A club with this name already exists.');
  });

  it('translates people email unique conflicts', () => {
    const error = translatePersonIdentityError({
      code: '23505',
      message: 'duplicate key value violates unique constraint "people_email_unique"',
    });

    expect(error.message).toBe('A person with this email already exists.');
  });

  it('passes through unrelated errors', () => {
    const error = translateClubIdentityError(new Error('Permission denied'));

    expect(error.message).toBe('Permission denied');
  });
});
