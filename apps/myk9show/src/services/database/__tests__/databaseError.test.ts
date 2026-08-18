/**
 * MYK9-177: `createDatabaseError` and the version every test sees must agree.
 *
 * `src/test/setup.ts` mocks `@/services/database/supabaseClient` globally. For
 * years that mock carried its own `createDatabaseError`, and the copy drifted:
 * it returned `code: undefined` for `Error` inputs while production read `code`
 * off anything handed to it. Both shapes occur for real — a raw PostgREST error
 * is a plain object, while anything through `translatePersonIdentityError`
 * arrives as an `Error` — so the same production line propagated a code in the
 * app and lost it under test. That reddened correct code (#1651) and hid real
 * propagation gaps behind an already-`undefined` expectation.
 *
 * The first block pins the real helper's extraction. The second pins that the
 * globally-mocked module behaves identically, so re-inlining a stand-in in
 * setup.ts fails here instead of surfacing as a mystery failure in an unrelated
 * suite months later. A spy *wrapping* the real implementation is fine; a
 * reimplementation of it is not.
 */

import { describe, it, expect } from 'vitest';
import { createDatabaseError } from '../databaseError';
// Deliberately the mocked path: this is what every other test file resolves to.
import { createDatabaseError as mockedCreateDatabaseError } from '../supabaseClient';

/** What Postgres returns when `people_email_unique` is violated. */
const POSTGREST_ERROR = {
  message: 'duplicate key value violates unique constraint "people_email_unique"',
  code: '23505',
  details: 'Key (email)=(taken@example.com) already exists.',
  hint: null,
};

/** What `translatePersonIdentityError` hands back: an Error carrying the code. */
const translatedError = () =>
  Object.assign(new Error('A person with this email already exists.'), {
    code: '23505',
    details: 'Key (email)=(taken@example.com) already exists.',
  });

const INPUTS: Array<[name: string, build: () => unknown]> = [
  ['a plain PostgREST error', () => POSTGREST_ERROR],
  ['an Error carrying a code', translatedError],
  ['a bare Error', () => new Error('boom')],
  ['an object with no message', () => ({ code: 'PGRST116' })],
  ['a string', () => 'boom'],
  ['null', () => null],
  ['undefined', () => undefined],
];

describe('createDatabaseError', () => {
  it('reads the code off an Error instance, not just a plain object', () => {
    expect(createDatabaseError(translatedError(), 'user', 'update').code).toBe('23505');
  });

  it('reads the code off a plain PostgREST error', () => {
    expect(createDatabaseError(POSTGREST_ERROR, 'user', 'update').code).toBe('23505');
  });

  it('leaves the code undefined when the input carries none', () => {
    expect(createDatabaseError(new Error('boom'), 'user', 'update').code).toBeUndefined();
  });

  it('keeps the input message and falls back when there is none', () => {
    expect(createDatabaseError(new Error('boom')).message).toBe('boom');
    expect(createDatabaseError(POSTGREST_ERROR).message).toBe(POSTGREST_ERROR.message);
    expect(createDatabaseError(null).message).toBe('Database operation failed');
    expect(createDatabaseError('boom').message).toBe('Database operation failed');
  });

  it('records the table and operation it was given', () => {
    expect(createDatabaseError(POSTGREST_ERROR, 'user', 'update')).toMatchObject({
      name: 'DatabaseError',
      table: 'user',
      operation: 'update',
    });
  });
});

describe('the globally-mocked supabaseClient exposes the real createDatabaseError', () => {
  it.each(INPUTS)('agrees with the real helper for %s', (_name, build) => {
    expect(mockedCreateDatabaseError(build(), 'user', 'update')).toEqual(
      createDatabaseError(build(), 'user', 'update')
    );
  });

  // The specific divergence that caused MYK9-177, asserted head-on so a
  // regression names itself rather than showing up as a deep-equality diff.
  it('propagates the code for an Error input', () => {
    expect(mockedCreateDatabaseError(translatedError(), 'user', 'update').code).toBe('23505');
  });
});
