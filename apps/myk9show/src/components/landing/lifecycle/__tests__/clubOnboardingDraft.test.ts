import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearClubOnboardingDraft,
  readClubOnboardingDraft,
  saveClubOnboardingDraft,
  type ClubOnboardingDraft,
} from '../clubOnboardingDraft';

const KEY = 'myk9:club-onboarding-draft';
const draft: ClubOnboardingDraft = {
  clubName: 'Tri-State Kennel Club',
  organization: 'AKC',
  clubNumbers: { AKC: '1', UKC: '', ASCA: '' },
  contactName: 'Pat Morgan',
  contactEmail: 'pat@example.com',
  contactPhone: '',
  firstShowDate: '',
  message: '',
};

describe('club onboarding draft', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('round-trips a saved draft and clears it', () => {
    saveClubOnboardingDraft(draft);
    expect(readClubOnboardingDraft()).toEqual(draft);
    clearClubOnboardingDraft();
    expect(readClubOnboardingDraft()).toBeNull();
  });

  it.each([
    { label: 'not JSON', raw: '{nope' },
    { label: 'not an object', raw: '"text"' },
    { label: 'a non-string field', raw: JSON.stringify({ ...draft, clubName: 42 }) },
    { label: 'a missing field', raw: JSON.stringify({ ...draft, message: undefined }) },
    { label: 'numbers as an array', raw: JSON.stringify({ ...draft, clubNumbers: [] }) },
    {
      label: 'numbers missing an organization',
      raw: JSON.stringify({ ...draft, clubNumbers: { AKC: '1' } }),
    },
    {
      label: 'a non-string club number',
      raw: JSON.stringify({ ...draft, clubNumbers: { AKC: 1, UKC: '', ASCA: '' } }),
    },
  ])('returns null for $label', ({ raw }) => {
    sessionStorage.setItem(KEY, raw);
    expect(readClubOnboardingDraft()).toBeNull();
  });
});
