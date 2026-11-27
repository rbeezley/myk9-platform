import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLUB_ONBOARDING_DRAFT_MAX_AGE_MS,
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

/** What the module stores: the draft, its id and when it was saved. */
const stored = (value: unknown, savedAt: unknown = Date.now()): string =>
  JSON.stringify({ id: 'draft-1', savedAt, draft: value });

describe('club onboarding draft', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // MYK9-2469: the confirmation email opens a new tab. Session storage is per tab, so a draft
  // kept there was missing exactly where she needed it.
  it('keeps the draft where a new tab of the same browser can read it', () => {
    saveClubOnboardingDraft(draft);
    expect(localStorage.getItem(KEY)).not.toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('drops a draft older than a day, and removes it from storage', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-27T12:00:00Z'));
    const id = saveClubOnboardingDraft(draft);

    vi.setSystemTime(Date.now() + CLUB_ONBOARDING_DRAFT_MAX_AGE_MS - 1000);
    expect(readClubOnboardingDraft(id)).toEqual(draft);

    vi.setSystemTime(Date.now() + 2000);
    expect(readClubOnboardingDraft(id)).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('round-trips a saved draft and clears it', () => {
    const id = saveClubOnboardingDraft(draft);
    expect(readClubOnboardingDraft(id)).toEqual(draft);
    clearClubOnboardingDraft();
    expect(readClubOnboardingDraft(id)).toBeNull();
  });

  it('gives each saved draft its own opaque id', () => {
    const first = saveClubOnboardingDraft(draft);
    const second = saveClubOnboardingDraft(draft);
    expect(first).toEqual(expect.any(String));
    expect(first).not.toBe(second);
  });

  // The shared-computer case: the next visitor has no id, or another one.
  it.each([
    { label: 'no id', id: null },
    { label: 'an empty id', id: '' },
    { label: 'a different id', id: 'someone-elses' },
  ])('returns no draft for $label, and keeps it for its owner', ({ id }) => {
    const ownId = saveClubOnboardingDraft(draft);
    expect(readClubOnboardingDraft(id)).toBeNull();
    expect(readClubOnboardingDraft(ownId)).toEqual(draft);
  });

  it.each([
    { label: 'not JSON', raw: '{nope' },
    { label: 'not an object', raw: '"text"' },
    { label: 'a draft with no saved time (the old shape)', raw: JSON.stringify(draft) },
    { label: 'a draft with no id', raw: JSON.stringify({ savedAt: Date.now(), draft }) },
    { label: 'a saved time that is not a number', raw: stored(draft, 'today') },
    { label: 'a saved time in the future', raw: stored(draft, Date.now() + 60_000) },
    { label: 'a non-string field', raw: stored({ ...draft, clubName: 42 }) },
    { label: 'a missing field', raw: stored({ ...draft, message: undefined }) },
    { label: 'numbers as an array', raw: stored({ ...draft, clubNumbers: [] }) },
    {
      label: 'numbers missing an organization',
      raw: stored({ ...draft, clubNumbers: { AKC: '1' } }),
    },
    {
      label: 'a non-string club number',
      raw: stored({ ...draft, clubNumbers: { AKC: 1, UKC: '', ASCA: '' } }),
    },
  ])('returns null for $label', ({ raw }) => {
    localStorage.setItem(KEY, raw);
    expect(readClubOnboardingDraft('draft-1')).toBeNull();
  });
});
