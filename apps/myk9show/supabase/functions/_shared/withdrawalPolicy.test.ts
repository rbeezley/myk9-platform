import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveWithdrawalPolicy,
  describeWithdrawalPolicyText,
  resolveWithdrawalRefundCents,
} from './withdrawalPolicy.ts';
import { withdrawalPolicyTermFixtures } from '../../../src/features/payments/withdrawalPolicyTermFixtures';

const club = {
  default_withdrawal_retention_type: 'flat',
  default_withdrawal_retention_value: 500,
  default_withdrawal_policy_notes: null,
};

const noShowOverride = {
  withdrawal_cutoff_date: null,
  withdrawal_retention_type: null,
  withdrawal_retention_value: null,
  withdrawal_policy_notes: null,
};

describe('resolveWithdrawalPolicy', () => {
  it('uses the show override when any override field is set', () => {
    const policy = resolveWithdrawalPolicy(
      {
        withdrawal_cutoff_date: '2026-06-01',
        withdrawal_retention_type: 'percent',
        withdrawal_retention_value: 20,
        withdrawal_policy_notes: null,
      },
      club
    );
    expect(policy).toEqual({
      cutoffDate: '2026-06-01',
      retentionType: 'percent',
      retentionValue: 20,
      retentionDeclared: true,
      notes: null,
    });
  });

  it('falls back to the club default when the show declares nothing', () => {
    const policy = resolveWithdrawalPolicy(noShowOverride, club);
    expect(policy).toEqual({
      cutoffDate: null,
      retentionType: 'flat',
      retentionValue: 500,
      retentionDeclared: true,
      notes: null,
    });
  });

  // MYK9-454. This resolver runs on the MONEY path: stripe-webhook and
  // stripe-payment-link snapshot the policy at payment time, so a club cutoff
  // leaking in here is what a later refund is computed against.
  it('never sources a cutoff date from the club row, even if the column holds one', () => {
    const legacyClub = { ...club, default_withdrawal_cutoff_date: '2026-05-01' };
    expect(resolveWithdrawalPolicy(noShowOverride, legacyClub)?.cutoffDate).toBeNull();
  });

  it('leaves a club-only refund manual instead of retaining on a stale club cutoff', () => {
    const legacyClub = { ...club, default_withdrawal_cutoff_date: '2026-05-01' };
    const policy = resolveWithdrawalPolicy(noShowOverride, legacyClub);

    const r = resolveWithdrawalRefundCents(
      policy,
      3000,
      new Date('2026-08-01T12:00:00Z'),
      'America/New_York'
    );

    expect(r.reason).toBe('no_cutoff');
    expect(r.refundCents).toBe(3000);
    expect(r.retainedCents).toBe(0);
  });

  // MYK9-454 follow-up (Codex review of #2156). Same defect as the client
  // resolver, and here it lands in the snapshot taken at PAYMENT time: an
  // all-or-nothing choice let a show that declared only its cutoff drop the
  // club's office fee, refunding in full at high confidence.
  it('MONEY: a show cutoff inherits the club retention instead of zeroing it', () => {
    const policy = resolveWithdrawalPolicy({ withdrawal_cutoff_date: '2026-06-01' }, club);
    expect(policy).toEqual({
      cutoffDate: '2026-06-01',
      retentionType: 'flat',
      retentionValue: 500,
      retentionDeclared: true,
      notes: null,
    });

    const r = resolveWithdrawalRefundCents(
      policy,
      3000,
      new Date('2026-08-01T12:00:00Z'),
      'America/New_York'
    );
    expect(r.retainedCents).toBe(500);
    expect(r.refundCents).toBe(2500);
  });

  it('fails closed for a legacy zero-retention snapshot', () => {
    expect(
      resolveWithdrawalRefundCents(
        { cutoffDate: '2026-06-01', retentionType: 'flat', retentionValue: 0, notes: null },
        3000,
        new Date('2026-08-01T12:00:00Z'),
        'America/New_York'
      )
    ).toMatchObject({ requiresManual: true, reason: 'manual_review' });
  });

  // Mirror of the client guard. This resolver's output becomes Stripe's
  // pre-payment `custom_text` and the entry's frozen snapshot, so a spliced
  // club note is a contradictory disclosure at the moment of payment.
  it('does not inherit club prose onto a show that declares its own policy', () => {
    const clubWithProse = { ...club, default_withdrawal_policy_notes: 'No refunds after Aug 1.' };
    const policy = resolveWithdrawalPolicy({ withdrawal_cutoff_date: '2026-06-01' }, clubWithProse);
    expect(policy?.notes).toBeNull();
    expect(policy?.retentionValue).toBe(500);
  });

  it('returns null when neither show nor club declares a policy', () => {
    expect(resolveWithdrawalPolicy(null, null)).toBeNull();
    expect(resolveWithdrawalPolicy({}, {})).toBeNull();
  });

  it('takes the show prose while still inheriting the club retention', () => {
    const policy = resolveWithdrawalPolicy({ withdrawal_policy_notes: 'See premium.' }, club);
    expect(policy?.notes).toBe('See premium.');
    expect(policy?.cutoffDate).toBeNull();
    expect(policy?.retentionType).toBe('flat');
    // Composed per field, so the club's fee survives a show-level note.
    expect(policy?.retentionValue).toBe(500);
  });

  it('preserves an undeclared retention as null', () => {
    const policy = resolveWithdrawalPolicy({ withdrawal_policy_notes: 'See premium.' }, null);
    expect(policy?.retentionValue).toBeNull();
  });

  it('marks an explicit zero retention so legacy zero snapshots fail closed', () => {
    expect(
      resolveWithdrawalPolicy(
        { withdrawal_cutoff_date: '2026-06-01', withdrawal_retention_value: 0 },
        null
      )
    ).toMatchObject({ retentionValue: 0, retentionDeclared: true });
  });

  it('defaults an unknown retention type to flat', () => {
    const policy = resolveWithdrawalPolicy(
      { withdrawal_retention_type: 'weird', withdrawal_retention_value: 100 },
      null
    );
    expect(policy?.retentionType).toBe('flat');
    expect(policy?.retentionValue).toBe(100);
  });
});

describe('describeWithdrawalPolicyText', () => {
  it('renders a single string with a flat retention after the cutoff', () => {
    const text = describeWithdrawalPolicyText({
      cutoffDate: '2026-06-01',
      retentionType: 'flat',
      retentionValue: 1000,
      notes: null,
    });
    expect(text).toBe(
      'Full refund of the entry fee until June 1, 2026; after that, $10.00 is kept. Service fees are non-refundable.'
    );
  });

  it('renders a percentage', () => {
    const text = describeWithdrawalPolicyText({
      cutoffDate: '2026-06-01',
      retentionType: 'percent',
      retentionValue: 25,
      notes: null,
    });
    expect(text).toContain('25% is kept');
  });

  it('keeps structured outcomes beside procedural notes', () => {
    const text = describeWithdrawalPolicyText({
      cutoffDate: '2026-06-01',
      retentionType: 'flat',
      retentionValue: 1000,
      notes: 'Email the secretary to withdraw.',
    });
    expect(text).toContain('$10.00 is kept');
    expect(text).toContain('Policy notes:');
    expect(text.endsWith('Email the secretary to withdraw.')).toBe(true);
  });

  it('requires review when notes describe a different refund schedule', () => {
    const policy = {
      cutoffDate: '2026-06-01',
      retentionType: 'flat' as const,
      retentionValue: 1000,
      notes: 'Full refund until closing, then 50% until 7 days out, none after.',
    };
    expect(
      resolveWithdrawalRefundCents(
        policy,
        3000,
        new Date('2026-06-15T12:00:00Z'),
        'America/New_York'
      )
    ).toMatchObject({ requiresManual: true, reason: 'manual_review' });
  });

  it('keeps multiline refund terms fail-closed while ignoring procedural wording', () => {
    const policy = {
      cutoffDate: '2026-06-01',
      retentionType: 'flat' as const,
      retentionValue: 1000,
      notes: 'Refunds:\nNone after the closing date.',
    };
    expect(describeWithdrawalPolicyText(policy)).not.toContain('$10.00 is kept');
    expect(
      resolveWithdrawalRefundCents(
        policy,
        3000,
        new Date('2026-06-15T12:00:00Z'),
        'America/New_York'
      )
    ).toMatchObject({ requiresManual: true, reason: 'manual_review' });

    const procedural = {
      ...policy,
      notes: 'Withdrawals must be submitted in writing by the closing deadline.',
    };
    expect(describeWithdrawalPolicyText(procedural)).toContain('$10.00 is kept');
  });

  it('keeps app and edge term detection fixtures aligned', () => {
    const basePolicy = {
      cutoffDate: '2026-06-01',
      retentionType: 'flat' as const,
      retentionValue: 1000,
      notes: null,
    };
    for (const [notes, expected] of withdrawalPolicyTermFixtures) {
      const text = describeWithdrawalPolicyText({ ...basePolicy, notes });
      expect(text.includes('$10.00 is kept')).toBe(!expected);
      expect(
        resolveWithdrawalRefundCents(
          { ...basePolicy, notes },
          5000,
          new Date('2026-06-15T12:00:00Z'),
          'America/New_York'
        ).requiresManual
      ).toBe(expected);
    }
  });

  it('keeps the app and edge detector implementations byte-identical', () => {
    const detector = (source: string) => source.match(/return (\/.*?\/is)\.test/)?.[1];
    const appSource = readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../../../src/features/payments/withdrawalPolicyTerms.ts'
      ),
      'utf8'
    );
    const edgeSource = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), 'withdrawalPolicy.ts'),
      'utf8'
    );
    const appDetector = detector(appSource);
    const edgeDetector = detector(edgeSource);
    expect(appDetector).toBeDefined();
    expect(edgeDetector).toBeDefined();
    expect(edgeDetector).toBe(appDetector);
  });

  it('prose-only policy renders notes + fee sentence, no deadline', () => {
    const text = describeWithdrawalPolicyText({
      cutoffDate: null,
      retentionType: 'flat',
      retentionValue: 0,
      notes: 'Full until closing, then 50%.',
    });
    expect(text).toBe(
      'Service fees are non-refundable. Policy notes: Full until closing, then 50%.'
    );
  });

  it('unset policy renders the neutral contact-the-club line', () => {
    expect(describeWithdrawalPolicyText(null)).toBe(
      'Refund policy: contact the club. Service fees are non-refundable.'
    );
  });

  it('always ends every variant with the service-fee disclosure', () => {
    expect(describeWithdrawalPolicyText(null)).toContain('Service fees are non-refundable.');
    expect(
      describeWithdrawalPolicyText({
        cutoffDate: '2026-06-01',
        retentionType: 'flat',
        retentionValue: 0,
        notes: null,
      })
    ).toContain('Service fees are non-refundable.');
  });
});

describe('resolveWithdrawalRefundCents', () => {
  it('fails closed for a legacy zero-retention snapshot', () => {
    expect(
      resolveWithdrawalRefundCents(
        {
          cutoffDate: '2026-06-01',
          retentionType: 'flat',
          retentionValue: 0,
          notes: null,
        },
        5000,
        new Date('2026-06-15T12:00:00Z'),
        'America/New_York'
      )
    ).toMatchObject({ requiresManual: true, reason: 'manual_review' });
  });

  it('keeps structured refund guidance for procedural notes', () => {
    expect(
      resolveWithdrawalRefundCents(
        {
          cutoffDate: '2026-06-01',
          retentionType: 'flat',
          retentionValue: 1000,
          notes: 'Email the secretary to withdraw before closing date.',
        },
        5000,
        new Date('2026-06-15T12:00:00Z'),
        'America/New_York'
      )
    ).toMatchObject({
      requiresManual: false,
      reason: 'after_cutoff',
      retainedCents: 1000,
      refundCents: 4000,
    });
  });

  it('refunds the exact snapshot amount after the cutoff', () => {
    expect(
      resolveWithdrawalRefundCents(
        {
          cutoffDate: '2026-06-01',
          retentionType: 'flat',
          retentionValue: 1000,
          notes: null,
        },
        5000,
        new Date('2026-06-02T12:00:00Z'),
        'America/Chicago'
      )
    ).toEqual({
      refundCents: 4000,
      retainedCents: 1000,
      requiresManual: false,
      reason: 'after_cutoff',
    });
  });

  it('uses the show timezone for the cutoff calendar day', () => {
    expect(
      resolveWithdrawalRefundCents(
        {
          cutoffDate: '2026-06-01',
          retentionType: 'flat',
          retentionValue: 1000,
          notes: null,
        },
        5000,
        new Date('2026-06-02T04:30:00Z'),
        'America/Chicago'
      )
    ).toEqual({
      refundCents: 5000,
      retainedCents: 0,
      requiresManual: false,
      reason: 'before_cutoff',
    });
  });

  it('rounds percent retention without losing cents', () => {
    const result = resolveWithdrawalRefundCents(
      {
        cutoffDate: '2026-06-01',
        retentionType: 'percent',
        retentionValue: 25,
        notes: null,
      },
      333,
      new Date('2026-06-02T12:00:00Z'),
      'America/New_York'
    );

    expect(result.retainedCents).toBe(83);
    expect(result.refundCents).toBe(250);
    expect(result.retainedCents + result.refundCents).toBe(333);
  });
});
