import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  PREMIUM_OFFICIALS_SELECT,
  pickPremiumOfficial,
  type PremiumOfficialRow,
} from './showOfficialsRow.ts';

const person = (
  first: string,
  last: string,
  extra: Partial<PremiumOfficialRow['people']> = {}
) => ({
  first_name: first,
  last_name: last,
  email: null,
  phone: null,
  ...extra,
});

describe('pickPremiumOfficial (MYK9-2056)', () => {
  it('returns the secretary and chair named in show_officials', () => {
    const rows: PremiumOfficialRow[] = [
      { role: 'secretary', people: person('Sam', 'Sec', { email: 's@example.com', phone: '555' }) },
      { role: 'chairman', people: person('Cara', 'Chair') },
      { role: 'steward', people: person('Stu', 'Steward') },
    ];

    expect(pickPremiumOfficial(rows, 'secretary')).toEqual({
      name: 'Sam Sec',
      email: 's@example.com',
      phone: '555',
      mailingAddress: null,
    });
    expect(pickPremiumOfficial(rows, 'chairman')).toEqual({
      name: 'Cara Chair',
      email: null,
      phone: null,
      mailingAddress: null,
    });
  });

  it('carries the mailing address typed on the show official, never one from the person (MYK9-2065)', () => {
    const rows: PremiumOfficialRow[] = [
      {
        role: 'secretary',
        premium_mailing_address: '  PO Box 9\nTulsa, OK  ',
        people: person('Sam', 'Sec'),
      },
      { role: 'chairman', premium_mailing_address: '   ', people: person('Cara', 'Chair') },
    ];

    expect(pickPremiumOfficial(rows, 'secretary')?.mailingAddress).toBe('PO Box 9\nTulsa, OK');
    expect(pickPremiumOfficial(rows, 'chairman')?.mailingAddress).toBeNull();
    expect(PREMIUM_OFFICIALS_SELECT).toContain('premium_mailing_address');
    expect(PREMIUM_OFFICIALS_SELECT).not.toMatch(/street_address|city|zip/);
  });

  it('prints the one named first when a role has several people', () => {
    const rows: PremiumOfficialRow[] = [
      { role: 'secretary', created_at: '2026-02-01', people: person('Later', 'One') },
      { role: 'secretary', created_at: '2026-01-01', people: person('First', 'One') },
    ];

    expect(pickPremiumOfficial(rows, 'secretary')?.name).toBe('First One');
  });

  it('returns null when nobody, or nobody with a name, holds the role', () => {
    expect(pickPremiumOfficial([], 'secretary')).toBeNull();
    expect(pickPremiumOfficial(null, 'chairman')).toBeNull();
    expect(
      pickPremiumOfficial([{ role: 'chairman', people: person('', '') }], 'chairman')
    ).toBeNull();
    expect(pickPremiumOfficial([{ role: 'chairman', people: null }], 'chairman')).toBeNull();
  });

  it('the generator reads officials from show_officials, not retired user_roles rows', () => {
    const source = readFileSync(join(__dirname, 'index.ts'), 'utf8');

    expect(source).toContain(".from('show_officials')");
    expect(source).not.toContain(".from('user_roles')");
  });
});
