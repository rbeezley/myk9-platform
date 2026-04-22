import { describe, it, expect } from 'vitest';
import { translateDogDbError } from './translateDogDbError';

describe('translateDogDbError', () => {
  it('returns a plain Error for non-Error input', () => {
    const result = translateDogDbError('boom');
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('boom');
  });

  it('surfaces the microchip-specific message for 23505 on microchip_number', () => {
    const raw = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "dogs_microchip_number_idx"',
    };
    const result = translateDogDbError(raw);
    expect(result.message).toBe('A dog with this microchip number already exists.');
    expect((result as Error & { cause?: unknown }).cause).toBe(raw);
  });

  it('falls back to a generic conflict message for other 23505s', () => {
    const raw = { code: '23505', message: 'duplicate key value violates some_other_idx' };
    const result = translateDogDbError(raw);
    expect(result.message).toBe('This dog conflicts with an existing record.');
  });

  it('detects duplicate key via message when code is missing', () => {
    const raw = { message: 'duplicate key value on microchip_number index' };
    const result = translateDogDbError(raw);
    expect(result.message).toBe('A dog with this microchip number already exists.');
  });

  it('maps 23503 to an owner-missing message', () => {
    const raw = { code: '23503', message: 'foreign key violation on owner_id' };
    const result = translateDogDbError(raw);
    expect(result.message).toBe(
      'The selected owner no longer exists. Please refresh and try again.'
    );
  });

  it('maps 42501 to a permission message', () => {
    const raw = { code: '42501', message: 'insufficient privilege' };
    const result = translateDogDbError(raw);
    expect(result.message).toBe('You do not have permission to save this dog.');
  });

  it('detects RLS errors by message text when code is missing', () => {
    const raw = { message: 'new row violates row-level security policy for table "dogs"' };
    const result = translateDogDbError(raw);
    expect(result.message).toBe('You do not have permission to save this dog.');
  });

  it('passes unrecognized errors through unchanged', () => {
    const raw = new Error('something else went wrong');
    const result = translateDogDbError(raw);
    expect(result).toBe(raw);
  });

  it('handles null input without throwing', () => {
    const result = translateDogDbError(null);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('null');
  });

  it('handles errors with non-string code/message fields', () => {
    const raw = { code: 23505, message: null };
    const result = translateDogDbError(raw);
    expect(result).toBeInstanceOf(Error);
  });
});
