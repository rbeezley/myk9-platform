import { describe, it, expect, vi } from 'vitest';
import { findOrCreateClubStripeAccount, type ClubStripeAccountDeps } from './clubStripeAccount';

type Lookup = Awaited<ReturnType<ClubStripeAccountDeps['findExisting']>>;

function makeDeps(lookups: Lookup[], insertError: { code?: string; message?: string } | null) {
  const findExisting = vi.fn<ClubStripeAccountDeps['findExisting']>();
  for (const result of lookups) findExisting.mockResolvedValueOnce(result);
  const deps = {
    findExisting,
    createAccount: vi.fn<ClubStripeAccountDeps['createAccount']>().mockResolvedValue('acct_new'),
    insertRow: vi
      .fn<ClubStripeAccountDeps['insertRow']>()
      .mockResolvedValue({ error: insertError }),
    deleteAccount: vi.fn<ClubStripeAccountDeps['deleteAccount']>().mockResolvedValue(undefined),
    logError: vi.fn<ClubStripeAccountDeps['logError']>(),
  };
  return deps;
}

describe('findOrCreateClubStripeAccount', () => {
  it('reuses the saved account without calling Stripe', async () => {
    const deps = makeDeps([{ data: { stripe_account_id: 'acct_saved' }, error: null }], null);

    const result = await findOrCreateClubStripeAccount(deps);

    expect(result).toEqual({ ok: true, stripeAccountId: 'acct_saved', created: false });
    expect(deps.createAccount).not.toHaveBeenCalled();
    expect(deps.insertRow).not.toHaveBeenCalled();
  });

  it('creates and saves an account when the club has none', async () => {
    const deps = makeDeps([{ data: null, error: null }], null);

    const result = await findOrCreateClubStripeAccount(deps);

    expect(result).toEqual({ ok: true, stripeAccountId: 'acct_new', created: true });
    expect(deps.insertRow).toHaveBeenCalledWith('acct_new');
    expect(deps.deleteAccount).not.toHaveBeenCalled();
  });

  it('fails closed on a lookup error and never creates a second account', async () => {
    const deps = makeDeps([{ data: null, error: { code: '57014', message: 'timeout' } }], null);

    const result = await findOrCreateClubStripeAccount(deps);

    expect(result).toEqual({ ok: false, reason: 'lookup_failed' });
    expect(deps.createAccount).not.toHaveBeenCalled();
    expect(deps.insertRow).not.toHaveBeenCalled();
  });

  it('on a 23505 insert, deletes its own account and uses the row the other request saved', async () => {
    const deps = makeDeps(
      [
        { data: null, error: null },
        { data: { stripe_account_id: 'acct_winner' }, error: null },
      ],
      { code: '23505', message: 'duplicate key' }
    );

    const result = await findOrCreateClubStripeAccount(deps);

    expect(result).toEqual({ ok: true, stripeAccountId: 'acct_winner', created: false });
    expect(deps.deleteAccount).toHaveBeenCalledWith('acct_new');
    expect(deps.findExisting).toHaveBeenCalledTimes(2);
  });

  it('on a 23505 whose re-read fails, fails without inventing an account', async () => {
    const deps = makeDeps(
      [
        { data: null, error: null },
        { data: null, error: { message: 'connection reset' } },
      ],
      { code: '23505' }
    );

    expect(await findOrCreateClubStripeAccount(deps)).toEqual({
      ok: false,
      reason: 'persist_failed',
    });
    expect(deps.deleteAccount).toHaveBeenCalledWith('acct_new');
  });

  it('on a 23505 whose re-read finds no row, fails', async () => {
    const deps = makeDeps(
      [
        { data: null, error: null },
        { data: null, error: null },
      ],
      { code: '23505' }
    );

    expect(await findOrCreateClubStripeAccount(deps)).toEqual({
      ok: false,
      reason: 'persist_failed',
    });
  });

  it('on any other insert error, deletes the orphan and fails without a re-read', async () => {
    const deps = makeDeps([{ data: null, error: null }], { code: '42501', message: 'denied' });

    expect(await findOrCreateClubStripeAccount(deps)).toEqual({
      ok: false,
      reason: 'persist_failed',
    });
    expect(deps.deleteAccount).toHaveBeenCalledWith('acct_new');
    expect(deps.findExisting).toHaveBeenCalledTimes(1);
  });

  it('still fails cleanly when deleting the orphan throws', async () => {
    const deps = makeDeps([{ data: null, error: null }], { code: '42501' });
    deps.deleteAccount.mockRejectedValue(new Error('stripe down'));

    expect(await findOrCreateClubStripeAccount(deps)).toEqual({
      ok: false,
      reason: 'persist_failed',
    });
    expect(deps.logError).toHaveBeenCalledWith(
      'Could not clean up orphaned account acct_new:',
      expect.any(Error)
    );
  });
});
