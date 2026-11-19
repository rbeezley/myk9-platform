import { describe, expect, it } from 'vitest';
import {
  WITHDRAWAL_POLICY_TEXT_MAX_LENGTH,
  buildDefaultWithdrawalPolicyText,
  describeWithdrawalPolicyTextConflict,
  normalizeWithdrawalPolicyText,
  resolveWithdrawalPolicyText,
} from '../withdrawalPolicyText';
import { resolveWithdrawalRefundCents, type WithdrawalPolicy } from '../withdrawalPolicy';

const FLAT_10: WithdrawalPolicy = {
  cutoffDate: '2026-06-01',
  retentionType: 'flat',
  retentionValue: 1000,
  retentionDeclared: true,
  notes: null,
};

describe('buildDefaultWithdrawalPolicyText (MYK9-1976)', () => {
  it('AKC: both reasons, the AKC rule, and Pull as its own act with no refund promise', () => {
    const text = buildDefaultWithdrawalPolicyText(FLAT_10, 'AKC');
    expect(text).toBe(
      [
        'Full refund of the entry fee until June 1, 2026; after that, $10.00 is kept.',
        "Withdraw: an entry may be withdrawn only for a reason the AKC rules cover: dog in season or judge change. A withdrawal for that reason follows the AKC rule. Refund per the premium's rules; the show secretary confirms it. AKC clubs may ask for documentation, and withdrawals are expected at least 30 minutes before the first class of the day, so check the premium.",
        "Pull: the dog does not run, for any other reason. Refunds for a pull are at the club's discretion.",
      ].join('\n\n')
    );
  });

  it('UKC: both reasons under the UKC rule', () => {
    const text = buildDefaultWithdrawalPolicyText(FLAT_10, 'UKC');
    expect(text).toContain('the UKC rules cover: dog in season or judge change.');
    expect(text).toContain('follows the UKC rule.');
    expect(text).toContain(
      "Refund per the premium's rules; the show secretary confirms it. UKC requires a veterinary certificate showing the female came into season after the entry deadline.\n\nPull:"
    );
  });

  it('ASCA: judge change only, never in season', () => {
    const text = buildDefaultWithdrawalPolicyText(FLAT_10, 'ASCA');
    expect(text).toContain('the ASCA rules cover: judge change.');
    expect(text).not.toMatch(/in season/i);
    expect(text).not.toMatch(/documentation|certificate/i);
    expect(text).toContain('the show secretary confirms it.\n\nPull:');
  });

  it('no registry (the club card): names which registries cover in season', () => {
    const text = buildDefaultWithdrawalPolicyText(null, null);
    expect(text).toContain(
      "only for a reason the show's registry covers: judge change, and dog in season at AKC and UKC shows."
    );
    expect(text.startsWith('Refund policy: contact the club.')).toBe(true);
    expect(text).toContain(
      'the show secretary confirms it. AKC clubs may ask for documentation, and withdrawals are expected at least 30 minutes before the first class of the day, so check the premium. UKC requires a veterinary certificate showing the female came into season after the entry deadline.\n\nPull:'
    );
  });

  it('keeps Withdraw and Pull apart, never says "no refund" for a pull, and has no em dash', () => {
    for (const registry of ['AKC', 'UKC', 'ASCA', null] as const) {
      const text = buildDefaultWithdrawalPolicyText(FLAT_10, registry);
      const [withdraw, pull] = [
        text.split('\n\n').find(p => p.startsWith('Withdraw:')),
        text.split('\n\n').find(p => p.startsWith('Pull:')),
      ];
      expect(withdraw).toBeDefined();
      expect(pull).toBeDefined();
      expect(pull).not.toMatch(/no refund/i);
      expect(text).not.toContain('—');
    }
  });

  it("carries the club's policy notes", () => {
    const text = buildDefaultWithdrawalPolicyText(
      { ...FLAT_10, notes: 'Email the secretary to withdraw.' },
      'AKC'
    );
    expect(text.split('\n\n')).toContain('Email the secretary to withdraw.');
  });
});

describe('resolveWithdrawalPolicyText precedence', () => {
  it("show text, else the club's, else the default", () => {
    const base = { policy: FLAT_10, registryId: 'AKC' as const };
    expect(resolveWithdrawalPolicyText({ ...base, showText: 'Show.', clubText: 'Club.' })).toEqual({
      text: 'Show.',
      source: 'show',
    });
    expect(resolveWithdrawalPolicyText({ ...base, showText: null, clubText: 'Club.' })).toEqual({
      text: 'Club.',
      source: 'club',
    });
    expect(resolveWithdrawalPolicyText({ ...base, showText: '   ', clubText: null })).toEqual({
      text: buildDefaultWithdrawalPolicyText(FLAT_10, 'AKC'),
      source: 'default',
    });
  });
});

describe('normalizeWithdrawalPolicyText', () => {
  it('keeps line breaks, strips markup, trims, and saves blank as null', () => {
    expect(normalizeWithdrawalPolicyText('  One.\r\nTwo.\n\n\n\nThree <b>bold</b>  ')).toBe(
      'One.\nTwo.\n\nThree bold'
    );
    expect(normalizeWithdrawalPolicyText(' \n ')).toBeNull();
    expect(normalizeWithdrawalPolicyText(null)).toBeNull();
  });

  it('caps the text at the limit', () => {
    const long = 'a'.repeat(WITHDRAWAL_POLICY_TEXT_MAX_LENGTH + 50);
    expect(normalizeWithdrawalPolicyText(long)).toHaveLength(WITHDRAWAL_POLICY_TEXT_MAX_LENGTH);
  });
});

describe('describeWithdrawalPolicyTextConflict', () => {
  const NO_CUTOFF_FLAT_10: WithdrawalPolicy = { ...FLAT_10, cutoffDate: null };

  it('notes "no refunds" text against an amount kept below the fee', () => {
    expect(describeWithdrawalPolicyTextConflict('No refunds.', NO_CUTOFF_FLAT_10, 3000)).toMatch(
      /^Your policy text says there are no refunds, but the amount kept above is less than the entry fee/
    );
  });

  it('notes "no refunds" text against a full-refund cutoff', () => {
    expect(describeWithdrawalPolicyTextConflict('Entries are non-refundable.', FLAT_10, 3000)).toBe(
      'Your policy text says there are no refunds, but with the full-refund cutoff date above the app suggests a full refund for a withdrawal on or before June 1, 2026. The suggested refund follows the fields above, not the text.'
    );
  });

  it('is quiet when the fields keep the whole fee, or the text promises nothing', () => {
    expect(describeWithdrawalPolicyTextConflict('No refunds.', NO_CUTOFF_FLAT_10, 1000)).toBeNull();
    expect(
      describeWithdrawalPolicyTextConflict(
        'No refunds.',
        { ...NO_CUTOFF_FLAT_10, retentionType: 'percent', retentionValue: 100 },
        null
      )
    ).toBeNull();
    expect(
      describeWithdrawalPolicyTextConflict('Ask the secretary.', NO_CUTOFF_FLAT_10, 3000)
    ).toBeNull();
    // The default's own service-fee sentence is not a "no refunds" claim.
    expect(
      describeWithdrawalPolicyTextConflict(
        'Service fees are non-refundable.',
        NO_CUTOFF_FLAT_10,
        3000
      )
    ).toBeNull();
    expect(describeWithdrawalPolicyTextConflict('No refunds.', null, 3000)).toBeNull();
  });

  it('with no fee known (the club card), a flat amount kept is taken to be below the fee', () => {
    expect(describeWithdrawalPolicyTextConflict('No refunds.', NO_CUTOFF_FLAT_10, null)).not.toBe(
      null
    );
  });
});

describe('the refund the app suggests ignores the policy text', () => {
  it('a "no refunds" text leaves the computed refund exactly as the fields set it', () => {
    const before = resolveWithdrawalRefundCents(
      FLAT_10,
      3000,
      new Date('2026-06-10T12:00:00Z'),
      'America/Chicago'
    );
    const { text } = resolveWithdrawalPolicyText({
      showText: 'No refunds, for any reason.',
      clubText: null,
      policy: FLAT_10,
      registryId: 'AKC',
    });
    expect(text).toBe('No refunds, for any reason.');
    const after = resolveWithdrawalRefundCents(
      FLAT_10,
      3000,
      new Date('2026-06-10T12:00:00Z'),
      'America/Chicago'
    );
    expect(after).toEqual(before);
    expect(after).toEqual({
      refundCents: 2000,
      retainedCents: 1000,
      requiresManual: false,
      reason: 'after_cutoff',
    });
  });
});
