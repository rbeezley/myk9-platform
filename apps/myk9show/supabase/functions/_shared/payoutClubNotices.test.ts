import { describe, expect, it, vi } from 'vitest';
import { resolveClubMoneyRecipients, type ClubAdminRoleRow } from './clubMoneyRecipients';
import { payoutSentEmail, type SendEmail } from './clubMoneyEmails';
import { emailClub, notifyClubOfTransferFailure } from './payoutClubNotices';
import { transferFailureOutcome, type PayoutAttempt } from './payoutFailureOwner';

function admin(email: string, isActive = true): ClubAdminRoleRow {
  return { is_active: isActive, expires_at: null, people: { email, deleted_at: null } };
}

function depsFor(contactEmail: string | null, admins: ClubAdminRoleRow[]) {
  const send = vi.fn<SendEmail>(async () => {});
  return {
    send,
    deps: {
      loadRecipients: async () => resolveClubMoneyRecipients(contactEmail, admins),
      send,
    },
  };
}

const PAYMENTS_URL = 'https://myk9show.com/clubs/club-1?tab=payments';

describe('emailClub (one payout sent)', () => {
  const email = payoutSentEmail({
    clubName: 'Valley KC',
    showName: 'Fall Trial',
    amountCents: 12500,
  });

  it('two admins and a separate contact address get three messages', async () => {
    const { deps, send } = depsFor('club@example.org', [
      admin('ann@example.org'),
      admin('bob@example.org'),
    ]);

    await expect(emailClub(deps, email)).resolves.toBe(3);
    expect(send.mock.calls.map(call => call[0])).toEqual([
      'ann@example.org',
      'bob@example.org',
      'club@example.org',
    ]);
    expect(send).toHaveBeenCalledWith('ann@example.org', email.subject, email.html);
  });

  it('a club whose only admin is the contact address gets one message', async () => {
    const { deps, send } = depsFor('club@example.org', [admin('Club@Example.org')]);

    await expect(emailClub(deps, email)).resolves.toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('a deactivated admin receives nothing', async () => {
    const { deps, send } = depsFor('club@example.org', [
      admin('ann@example.org'),
      admin('gone@example.org', false),
    ]);

    await emailClub(deps, email);
    expect(send.mock.calls.map(call => call[0])).not.toContain('gone@example.org');
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe('notifyClubOfTransferFailure', () => {
  const clubError = Object.assign(new Error('Destination cannot receive transfers'), {
    code: 'insufficient_capabilities_for_transfer',
  });

  function input(owner: 'club' | 'platform', previous: () => Promise<PayoutAttempt | null>) {
    return {
      owner,
      clubName: 'Valley KC',
      showName: 'Fall Trial',
      amountCents: 12500,
      paymentsUrl: PAYMENTS_URL,
      loadPreviousAttempt: previous,
    };
  }

  it('a club bank failure emails the admins once, not once a night', async () => {
    const { deps, send } = depsFor('club@example.org', [admin('ann@example.org')]);
    const night1 = transferFailureOutcome(clubError, clubError.message, false);

    // Night 1: first failure of the episode.
    await expect(
      notifyClubOfTransferFailure(
        deps,
        input(night1.owner, async () => null)
      )
    ).resolves.toBe('sent');
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledWith(
      'ann@example.org',
      "Action needed: Valley KC's bank account needs attention",
      expect.stringContaining(PAYMENTS_URL)
    );

    // Night 2: same failure; the previous attempt is night 1's stamped row.
    const night2 = transferFailureOutcome(clubError, clubError.message, false);
    await expect(
      notifyClubOfTransferFailure(
        deps,
        input(night2.owner, async () => ({
          status: 'failed',
          failure_reason: night1.failureReason,
        }))
      )
    ).resolves.toBe('already_told');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('a platform failure emails no one at the club', async () => {
    const { deps, send } = depsFor('club@example.org', [admin('ann@example.org')]);
    const loadPreviousAttempt = vi.fn(async () => null);
    const platform = transferFailureOutcome(
      Object.assign(new Error('Too many requests'), { code: 'rate_limit' }),
      'Too many requests',
      false
    );

    await expect(
      notifyClubOfTransferFailure(deps, input(platform.owner, loadPreviousAttempt))
    ).resolves.toBe('platform');
    expect(send).not.toHaveBeenCalled();
    expect(loadPreviousAttempt).not.toHaveBeenCalled();
  });

  it('a balance delay emails no one at the club', async () => {
    const { deps, send } = depsFor('club@example.org', [admin('ann@example.org')]);
    const benign = transferFailureOutcome(new Error('Insufficient balance'), 'x', true);

    await notifyClubOfTransferFailure(
      deps,
      input(benign.owner, async () => null)
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('stays quiet when the previous attempt cannot be read', async () => {
    const { deps, send } = depsFor('club@example.org', [admin('ann@example.org')]);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      notifyClubOfTransferFailure(
        deps,
        input('club', async () => {
          throw new Error('db down');
        })
      )
    ).resolves.toBe('lookup_failed');
    expect(send).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
