// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { akcRegistry } from '../../../apps/myk9show/src/features/registries/akc';
import { ukcRegistry } from '../../../apps/myk9show/src/features/registries/ukc';
import { ascaRegistry } from '../../../apps/myk9show/src/features/registries/asca';
import {
  REGISTRY_WORDING_FOR_TEST,
  fullConfirmationIdempotencyKey,
  groupDueConfirmations,
  joinDogNames,
  registryWording,
  type ConfirmationEntryRow,
} from './fullConfirmation';

function row(id: string, overrides: Partial<ConfirmationEntryRow> = {}): ConfirmationEntryRow {
  return {
    id,
    show_id: 'show-1',
    class_id: 'c1',
    trial_id: 't1',
    registration_id: null,
    armband: '100',
    entry_fee: 25,
    entry_status: 'confirmed',
    check_in_status: null,
    confirmation_email_sent_at: null,
    confirmation_email_status: 'pending',
    dog: { name: 'Pip', owner_id: 'owner-1' },
    class: { name: 'Novice' },
    registration: null,
    ...overrides,
  };
}

describe('full confirmation planning (MYK9-1999)', () => {
  it('groups due entries per exhibitor per show, preferring the person on the entry form', () => {
    const { groups, unaddressed } = groupDueConfirmations([
      row('a'),
      row('b', { dog: { name: 'Rex', owner_id: 'owner-1' } }),
      row('c', { registration: { handler_id: 'handler-2' } }),
      row('d', { show_id: 'show-2' }),
      row('e', { dog: null }),
      row('f', { confirmation_email_sent_at: '2026-11-01T00:00:00Z' }),
    ]);
    expect(groups).toEqual([
      { showId: 'show-1', personId: 'owner-1', dueEntryIds: ['a', 'b'] },
      { showId: 'show-1', personId: 'handler-2', dueEntryIds: ['c'] },
      { showId: 'show-2', personId: 'owner-1', dueEntryIds: ['d'] },
    ]);
    expect(unaddressed).toEqual(['e']);
  });

  it('caps the exhibitors per run, keeping every entry of an exhibitor it takes', () => {
    const { groups } = groupDueConfirmations(
      [row('a'), row('b', { dog: { owner_id: 'owner-2' } }), row('c')],
      1
    );
    expect(groups).toEqual([{ showId: 'show-1', personId: 'owner-1', dueEntryIds: ['a', 'c'] }]);
  });

  it('keys an email on the exact entries it confirms, in any order', async () => {
    const group = { showId: 's', personId: 'p', dueEntryIds: ['b', 'a'] };
    const same = await fullConfirmationIdempotencyKey({ ...group, dueEntryIds: ['a', 'b'] });
    expect(await fullConfirmationIdempotencyKey(group)).toBe(same);
    expect(await fullConfirmationIdempotencyKey({ ...group, dueEntryIds: ['a'] })).not.toBe(same);
    expect(same.startsWith('full-confirmation-s-p-')).toBe(true);
  });

  it('joins dog names in plain words', () => {
    expect(joinDogNames(['Pip'])).toBe('Pip');
    expect(joinDogNames(['Pip', 'Rex'])).toBe('Pip and Rex');
    expect(joinDogNames(['Pip', 'Rex', 'Ivy', 'Pip'])).toBe('Pip, Rex and Ivy');
  });

  it('matches the app registry wording, and falls back to AKC', () => {
    for (const registry of [akcRegistry, ukcRegistry, ascaRegistry]) {
      expect(REGISTRY_WORDING_FOR_TEST[registry.id as 'AKC' | 'UKC' | 'ASCA']).toEqual({
        memberClubLanguage: registry.memberClubLanguage,
        licenseLanguage: registry.licenseLanguage,
      });
    }
    expect(registryWording(null)).toBe(REGISTRY_WORDING_FOR_TEST.AKC);
    expect(registryWording(' UKC ')).toBe(REGISTRY_WORDING_FOR_TEST.UKC);
  });
});
