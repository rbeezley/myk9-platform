import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildPremiumWithdrawalRow,
  PREMIUM_CLUB_WITHDRAWAL_COLUMNS,
  PREMIUM_SHOW_WITHDRAWAL_COLUMNS,
} from './withdrawalPolicyRow.ts';
import { EFFECTIVE_WITHDRAWAL_SELECT } from '@/features/payments/useEffectiveWithdrawalPolicy';
import { resolveEffectiveWithdrawalTerms } from '@/features/payments/effectiveWithdrawalTerms';

const columns = (list: string) =>
  list
    .split(',')
    .map(column => column.trim())
    .filter(Boolean);

/** The app's select, split into its show, club and trial columns. */
function appSelectColumns() {
  const flat = EFFECTIVE_WITHDRAWAL_SELECT.replace(/\s+/g, ' ');
  const club = /clubs \(([^)]*)\)/.exec(flat)?.[1] ?? '';
  const trials = /trials \(([^)]*)\)/.exec(flat)?.[1] ?? '';
  const show = flat.replace(/\w+ \([^)]*\)/g, '');
  return { show: columns(show), club: columns(club), trials: columns(trials) };
}

describe('generate-premium withdrawal policy row (MYK9-1976)', () => {
  it("reads every column the app's own policy read selects", () => {
    const app = appSelectColumns();
    expect(columns(PREMIUM_SHOW_WITHDRAWAL_COLUMNS)).toEqual(app.show);
    expect(columns(PREMIUM_CLUB_WITHDRAWAL_COLUMNS)).toEqual(app.club);
    expect(app.trials).toEqual(['registry_id']);

    const source = readFileSync(join(__dirname, 'index.ts'), 'utf8');
    expect(source).toMatch(/\$\{PREMIUM_SHOW_WITHDRAWAL_COLUMNS\},/);
    expect(source).toMatch(/clubs\(name, logo_url, \$\{PREMIUM_CLUB_WITHDRAWAL_COLUMNS\}\)/);
    expect(source).toMatch(
      /trials\(\s*id, name, date, planned_start_time, event_number, trial_type, registry_id,/
    );
    expect(source).toContain(
      'withdrawal: buildPremiumWithdrawalRow(show as Record<string, unknown>)'
    );
  });

  it('sends the raw columns, the trial registries and the club defaults, unresolved', () => {
    const row = buildPremiumWithdrawalRow({
      id: 'show-1',
      name: 'Spring Trial',
      withdrawal_cutoff_date: '2026-06-01',
      withdrawal_retention_type: 'flat',
      withdrawal_retention_value: 500,
      withdrawal_policy_notes: null,
      withdrawal_policy_text: 'Show text.\n\nSecond paragraph.',
      trials: [{ id: 't1', registry_id: 'UKC', classes: [] }, { id: 't2' }],
      clubs: {
        name: 'Club',
        logo_url: null,
        default_withdrawal_retention_type: 'percent',
        default_withdrawal_retention_value: 25,
        default_withdrawal_policy_notes: 'Club notes.',
        default_withdrawal_policy_text: 'Club text.',
      },
    });
    expect(row).toEqual({
      withdrawal_cutoff_date: '2026-06-01',
      withdrawal_retention_type: 'flat',
      withdrawal_retention_value: 500,
      withdrawal_policy_notes: null,
      withdrawal_policy_text: 'Show text.\n\nSecond paragraph.',
      trials: [{ registry_id: 'UKC' }, { registry_id: null }],
      clubs: {
        default_withdrawal_retention_type: 'percent',
        default_withdrawal_retention_value: 25,
        default_withdrawal_policy_notes: 'Club notes.',
        default_withdrawal_policy_text: 'Club text.',
      },
    });
  });

  it('accepts the club embed as a one-element array, and no club at all', () => {
    expect(
      buildPremiumWithdrawalRow({ clubs: [{ default_withdrawal_policy_text: 'Club text.' }] }).clubs
    ).toMatchObject({ default_withdrawal_policy_text: 'Club text.' });
    expect(buildPremiumWithdrawalRow({ clubs: null })).toMatchObject({ clubs: null, trials: [] });
  });

  it('resolves, in the app, to the same text the app reads for that show', () => {
    const showRow = {
      withdrawal_cutoff_date: '2026-06-01',
      withdrawal_retention_type: 'flat',
      withdrawal_retention_value: 500,
      withdrawal_policy_notes: null,
      withdrawal_policy_text: null,
      trials: [{ registry_id: 'AKC' }],
      clubs: {
        default_withdrawal_retention_type: null,
        default_withdrawal_retention_value: null,
        default_withdrawal_policy_notes: null,
        default_withdrawal_policy_text: null,
      },
    };
    const fromPremium = resolveEffectiveWithdrawalTerms(buildPremiumWithdrawalRow(showRow));
    expect(fromPremium).toEqual(resolveEffectiveWithdrawalTerms(showRow));
    expect(fromPremium.textSource).toBe('default');
    expect(fromPremium.text).toContain('the AKC rules cover');
  });
});
