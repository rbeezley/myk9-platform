/**
 * MYK9-175: `updateUser` must translate a duplicate-email conflict the way
 * `createUser` does.
 *
 * The asymmetry is invisible to every other test: both paths "return an error",
 * so only an assertion on the message text can see that one of them hands the
 * operator a raw constraint name. `UserDetailsView` renders this message
 * verbatim via `getErrorMessage`, so whatever lands here is what a person reads.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock only the supabase client; keep the real createDatabaseError / logQuery so
// the message- and code-propagation path is exercised end to end.
const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('../supabaseClient', async importOriginal => {
  const actual = await importOriginal<typeof import('../supabaseClient')>();
  return { ...actual, supabase: { from } };
});

// The guard itself is MYK9-136's concern. Stub only its entry point so each
// test can choose a decision without standing up an identity fixture; the real
// codes and copy are still imported below.
const { checkSignInEmailChange } = vi.hoisted(() => ({ checkSignInEmailChange: vi.fn() }));
vi.mock('./signInEmailGuard', async importOriginal => {
  const actual = await importOriginal<typeof import('./signInEmailGuard')>();
  return { ...actual, checkSignInEmailChange };
});

import { updateUser } from './reads';
import { SIGN_IN_EMAIL_LOCKED_CODE, SIGN_IN_EMAIL_LOCKED_MESSAGE } from './signInEmailGuard';

/** people.update(...).eq(...).is(...).select().single() */
const updateChain = (result: { data: unknown; error: unknown }) => {
  const chain: Record<string, unknown> = {};
  chain.update = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.is = vi.fn(() => chain);
  chain.select = vi.fn(() => chain);
  chain.single = vi.fn(() => Promise.resolve(result));
  return chain;
};

/** What Postgres actually returns when `people_email_unique` is violated. */
const DUPLICATE_EMAIL_ERROR = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "people_email_unique"',
  details: 'Key (lower(email))=(ada@example.com) already exists.',
  hint: null,
};

describe('updateUser — duplicate email copy (MYK9-175)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('translates a duplicate-email conflict into the copy the insert path uses', async () => {
    // An unlinked person: the one path that can still reach a 23505 here, since
    // MYK9-136 refuses the edit outright when an auth identity exists.
    checkSignInEmailChange.mockResolvedValue({ allowed: true, reason: 'no-identity' });
    from.mockReturnValue(updateChain({ data: null, error: DUPLICATE_EMAIL_ERROR }));

    const { error } = await updateUser('p1', { email: 'ada@example.com' });

    expect(error?.message).toBe('A person with this email already exists.');
    // The whole point of duplicateIdentityErrors is keeping constraint names
    // out of UI surfaces, and this one renders the message verbatim.
    expect(error?.message).not.toMatch(/people_email_unique/);
    // The code still has to survive translation — `getUserFriendlyError` maps
    // by code, and other surfaces branch on it.
    expect(error?.code).toBe('23505');
  });

  it('leaves the sign-in-email refusal message and code untouched', async () => {
    checkSignInEmailChange.mockResolvedValue({
      allowed: false,
      code: SIGN_IN_EMAIL_LOCKED_CODE,
      message: SIGN_IN_EMAIL_LOCKED_MESSAGE,
    });

    const { error } = await updateUser('p1', { email: 'taken@example.com' });

    expect(error?.message).toBe(SIGN_IN_EMAIL_LOCKED_MESSAGE);
    expect(error?.code).toBe(SIGN_IN_EMAIL_LOCKED_CODE);
    // Refused before any write.
    expect(from).not.toHaveBeenCalled();
  });

  it('passes a non-conflict failure through untranslated', async () => {
    checkSignInEmailChange.mockResolvedValue({ allowed: true, reason: 'no-identity' });
    from.mockReturnValue(
      updateChain({
        data: null,
        error: { code: '42501', message: 'permission denied for table people' },
      })
    );

    const { error } = await updateUser('p1', { email: 'ada@example.com' });

    expect(error?.message).toBe('permission denied for table people');
    expect(error?.code).toBe('42501');
  });
});
