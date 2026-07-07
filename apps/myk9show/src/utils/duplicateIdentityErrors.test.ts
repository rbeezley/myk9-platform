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

  it('translates unauthorized existing club reuse conflicts', () => {
    const error = translateClubIdentityError({
      code: '42501',
      message: 'club name already exists but caller is not authorized to use matching club',
    });

    expect(error.message).toBe(
      'A club with this name already exists, but your account does not have access to use it.'
    );
  });

  it('translates people email unique conflicts', () => {
    const error = translatePersonIdentityError({
      code: '23505',
      message: 'duplicate key value violates unique constraint "people_email_unique"',
      details: 'Email already exists',
    });

    expect(error.message).toBe('A person with this email already exists.');
    expect((error as Error & { code?: string }).code).toBe('23505');
    expect((error as Error & { details?: string }).details).toBe('Email already exists');
  });

  it('passes through unrelated errors', () => {
    const error = translateClubIdentityError({
      code: '23514',
      message: 'Permission denied',
      details: 'First name cannot be empty',
    });

    expect(error.message).toBe('Permission denied');
    expect((error as Error & { code?: string }).code).toBe('23514');
    expect((error as Error & { details?: string }).details).toBe('First name cannot be empty');
  });
});
