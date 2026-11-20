// MYK9-2187 Codex round 2: the hand recovery for a payout held on an
// unconfirmed Stripe mode marks only the operator's check, on a row still
// held as processing; it never moves money state by hand.
import { describe, expect, it } from 'vitest';
import { escapeHtml } from '../_shared/clubMoneyEmails';
import { attemptModeRecoveryHtml, MODE_CHECKED_REASON, modeCheckedSql } from './payoutModeRecovery';

/** Every SQL statement the alert prints, unescaped. */
function statements(html: string): string[] {
  const codes = [...html.matchAll(/<code>([^<]*)<\/code>/g)].map(m =>
    m[1]
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
  );
  return codes.filter(c => /^\s*(update|insert|delete)\b/i.test(c));
}

/** What a statement would set, as column = value pairs from its SET clause. */
function setColumns(sql: string): Record<string, string> {
  const set = /\bset\s+([\s\S]*?)\s+where\b/i.exec(sql)?.[1] ?? '';
  return Object.fromEntries(
    set.split(',').map(pair => {
      const [col, val] = pair.split('=').map(s => s.trim());
      return [col, val];
    })
  );
}

const ALL_CASES = [
  ['mismatch', false],
  ['mismatch', true],
  ['no_account', false],
  ['read_error', true],
] as const;

describe('the only hand statement', () => {
  it('sets the check and nothing else: status stays processing', () => {
    expect(setColumns(modeCheckedSql('row-0'))).toEqual({
      failure_reason: `'${MODE_CHECKED_REASON}'`,
    });
  });

  it('changes only that row, only while held as processing with no transfer recorded', () => {
    expect(modeCheckedSql('row-0')).toMatch(
      /where id = 'row-0' and status = 'processing' and stripe_transfer_id is null;$/
    );
  });
});

describe('attemptModeRecoveryHtml', () => {
  it.each(ALL_CASES)('%s (run live: %s): no instruction sets a status by hand', (mode, live) => {
    const sqls = statements(attemptModeRecoveryHtml(mode, live, 'show-1', 'row-0'));
    expect(sqls).toEqual([modeCheckedSql('row-0')]);
    for (const sql of sqls) expect(setColumns(sql)).not.toHaveProperty('status');
  });

  it('a mode mismatch points at the other mode only', () => {
    const html = attemptModeRecoveryHtml('mismatch', false, 'show-1', 'row-0');
    expect(html).toContain('in <strong>live mode</strong>, the mode the earlier attempt used');
    expect(html).not.toContain('both');
  });

  it.each(['no_account', 'read_error'] as const)(
    '%s: the operator must check both modes before changing anything',
    mode => {
      const html = attemptModeRecoveryHtml(mode, true, 'show-1', 'row-0');
      expect(html).toContain('both test mode and live mode');
      expect(html).toContain('check both before changing anything');
    }
  );

  it('a transfer found where the run cannot see is escalated, never recorded or reversed', () => {
    const html = attemptModeRecoveryHtml('mismatch', true, 'show-1', 'row-0');
    expect(html).toContain('change nothing');
    expect(html).toContain('Forward this alert to the myK9Show developer');
    expect(html.toLowerCase()).not.toContain('reverse the');
  });

  it('escapes the ids it prints', () => {
    const html = attemptModeRecoveryHtml('mismatch', false, '<show>', "row'<x>");
    expect(html).not.toContain('<show>');
    expect(html).not.toContain('<x>');
    expect(html).toContain(escapeHtml("row'<x>"));
  });
});
