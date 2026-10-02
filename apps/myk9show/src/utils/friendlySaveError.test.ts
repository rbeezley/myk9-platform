import { afterEach, describe, expect, it, vi } from 'vitest';
import { PremiumPublishError } from '@/features/premium/premiumPublishErrors';
import { translateDogDbError } from '@/hooks/translateDogDbError';
import { logger } from '@/services/LoggingService';
import { friendlySaveError, friendlySaveMessage, FriendlySaveError } from './friendlySaveError';

vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

const GENERIC = 'Your changes are still here. Try again.';
const pg = (code: string, message: string) => Object.assign(new Error(message), { code });

const authored: Array<[string, unknown, string]> = [
  [
    '22023 entry-close guard',
    pg('22023', 'Entries for this show closed on Oct 1.'),
    'Entries for this show closed on Oct 1.',
  ],
  ['P0002 not found', pg('P0002', 'That class no longer exists.'), 'That class no longer exists.'],
  [
    'MK013 product refusal',
    pg('MK013', 'This trial already has scored classes.'),
    'This trial already has scored classes.',
  ],
  [
    '23514 authored check',
    pg('23514', 'Close date must be before the first trial.'),
    'Close date must be before the first trial.',
  ],
  [
    '42501 authored refusal',
    pg(
      '42501',
      'This person already has entries, so only a site admin can change their email address.'
    ),
    'only a site admin can change their email address',
  ],
  [
    'PremiumPublishError',
    new PremiumPublishError(
      "Set this show's organization to AKC or UKC in Show settings, then try again.",
      'generation',
      'missing-organization'
    ),
    "Set this show's organization to AKC or UKC",
  ],
  [
    'translateDogDbError microchip',
    translateDogDbError({
      code: '23505',
      message: 'duplicate key value violates unique constraint "dogs_microchip_number_key"',
    }),
    'A dog with this microchip number already exists.',
  ],
  [
    'translateDogDbError registration',
    translateDogDbError({
      code: '23505',
      message:
        'duplicate key value violates unique constraint "dog_registrations_live_org_number_unique"',
    }),
    'A dog with this registration number already exists.',
  ],
  ['FriendlySaveError', new FriendlySaveError('That number is taken.'), 'That number is taken.'],
];

const technical: Array<[string, unknown]> = [
  ['network TypeError', new TypeError('Failed to fetch')],
  ['JS runtime error', new ReferenceError('x is not defined')],
  ['AbortError', Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' })],
  ['JWT expired', pg('PGRST301', 'JWT expired')],
  [
    'PGRST204 names a column',
    pg('PGRST204', "Could not find the 'nickname' column of 'dogs' in the schema cache"),
  ],
  ['PGRST116 row count', pg('PGRST116', 'JSON object requested, multiple (or no) rows returned')],
  ['PGRST301 as a sentence', pg('PGRST301', 'Please sign in again.')],
  ['42703 undefined column', pg('42703', 'column dogs.nickname does not exist')],
  ['22P02 bad input', pg('22P02', 'invalid input syntax for type uuid: "abc"')],
  ['empty message', new Error('')],
  ['non-error value', undefined],
  ['5xx response', Object.assign(new Error('Server blew up'), { status: 503 })],
  ['raw constraint text', new Error('new row for relation "shows" violates check constraint "x"')],
  ['RLS boilerplate', pg('42P17', 'new row violates row-level security policy for table "shows"')],
];

describe('friendlySaveError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(authored)(
    'shows the authored message for %s, with no "Try again"',
    (_name, error, text) => {
      const { description } = friendlySaveError(error);
      expect(description).toContain(text);
      expect(description).toContain('Your changes are still here.');
      expect(description).not.toMatch(/Try again\.$/);
      expect(friendlySaveMessage(error)).toContain(text);
    }
  );

  it.each(technical)('falls back to generic copy for %s', (_name, error) => {
    expect(friendlySaveError(error)).toEqual({
      title: "Couldn't save your changes",
      description: GENERIC,
    });
  });

  it('maps a raw unique violation to the mapped message and never echoes the constraint', () => {
    const { description } = friendlySaveError(
      pg('23505', 'duplicate key value violates unique constraint "people_email_key"')
    );
    expect(description).toContain('This record already exists.');
    expect(description).not.toContain('people_email_key');
    expect(description).not.toContain('Try again');
  });

  it('keeps the permission copy for platform 42501 boilerplate, without "Try again"', () => {
    const { description } = friendlySaveError(pg('42501', 'permission denied for table people'));
    expect(description).toContain("You don't have permission");
    expect(description).not.toContain('Try again');
  });

  it('treats an offline browser as a technical failure', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(friendlySaveError(pg('22023', 'Entries closed.')).description).toBe(GENERIC);
  });

  it('is pure: it never logs', () => {
    friendlySaveError(pg('23505', 'duplicate key value violates unique constraint "x"'));
    friendlySaveError(new TypeError('Failed to fetch'));
    expect(logger.error).not.toHaveBeenCalled();
  });
});
