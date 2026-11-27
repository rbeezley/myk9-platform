import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLUB_ONBOARDING_DRAFT_MAX_AGE_MS,
  clearAllClubOnboardingDrafts,
  clearClubOnboardingDraft,
  readClubOnboardingDraft,
  saveClubOnboardingDraft,
  type ClubOnboardingDraft,
} from '../clubOnboardingDraft';

const PREFIX = 'myk9:club-onboarding-draft:';
const LEGACY_KEY = 'myk9:club-onboarding-draft';
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
    const id = saveClubOnboardingDraft(draft);
    expect(localStorage.getItem(PREFIX + id)).not.toBeNull();
    expect(sessionStorage.getItem(PREFIX + id)).toBeNull();
  });

  it('drops a draft older than a day, and removes it from storage', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-27T12:00:00Z'));
    const id = saveClubOnboardingDraft(draft);

    vi.setSystemTime(Date.now() + CLUB_ONBOARDING_DRAFT_MAX_AGE_MS - 1000);
    expect(readClubOnboardingDraft(id)).toEqual(draft);

    vi.setSystemTime(Date.now() + 2000);
    expect(readClubOnboardingDraft(id)).toBeNull();
    expect(localStorage.getItem(PREFIX + id)).toBeNull();
  });

  it('round-trips a saved draft and clears it', () => {
    const id = saveClubOnboardingDraft(draft);
    expect(readClubOnboardingDraft(id)).toEqual(draft);
    clearClubOnboardingDraft(id);
    expect(readClubOnboardingDraft(id)).toBeNull();
  });

  // Two club forms in one browser (two tabs, or a second visitor): each keeps its own draft.
  it('keeps two flows apart: reading, and clearing, one leaves the other restorable', () => {
    const other = { ...draft, clubName: 'Second Kennel Club' };
    const a = saveClubOnboardingDraft(draft);
    const b = saveClubOnboardingDraft(other);
    expect(readClubOnboardingDraft(a)).toEqual(draft);
    expect(readClubOnboardingDraft(b)).toEqual(other);

    clearClubOnboardingDraft(a);
    expect(readClubOnboardingDraft(a)).toBeNull();
    expect(readClubOnboardingDraft(b)).toEqual(other);

    const c = saveClubOnboardingDraft(draft);
    clearClubOnboardingDraft(b);
    expect(readClubOnboardingDraft(b)).toBeNull();
    expect(readClubOnboardingDraft(c)).toEqual(draft);
  });

  it('removes a stale draft on the next save, and on the next read', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-27T12:00:00Z'));
    const old = saveClubOnboardingDraft(draft);
    vi.setSystemTime(Date.now() + CLUB_ONBOARDING_DRAFT_MAX_AGE_MS + 1000);
    saveClubOnboardingDraft(draft);
    expect(localStorage.getItem(PREFIX + old)).toBeNull();

    const older = saveClubOnboardingDraft(draft);
    vi.setSystemTime(Date.now() + CLUB_ONBOARDING_DRAFT_MAX_AGE_MS + 1000);
    expect(readClubOnboardingDraft('anything')).toBeNull();
    expect(localStorage.getItem(PREFIX + older)).toBeNull();
  });

  it('removes the legacy single-key draft on a save and on a read', () => {
    localStorage.setItem(LEGACY_KEY, stored(draft));
    saveClubOnboardingDraft(draft);
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();

    localStorage.setItem(LEGACY_KEY, stored(draft));
    readClubOnboardingDraft(null);
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it('clears every club draft, and the legacy key, on this device', () => {
    const a = saveClubOnboardingDraft(draft);
    const b = saveClubOnboardingDraft(draft);
    localStorage.setItem(LEGACY_KEY, stored(draft));
    localStorage.setItem('unrelated', 'keep');
    clearAllClubOnboardingDrafts();
    expect(readClubOnboardingDraft(a)).toBeNull();
    expect(readClubOnboardingDraft(b)).toBeNull();
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(localStorage.getItem('unrelated')).toBe('keep');
  });

  it('gives each saved draft its own opaque id', () => {
    const first = saveClubOnboardingDraft(draft);
    const second = saveClubOnboardingDraft(draft);
    expect(first).toEqual(expect.any(String));
    expect(first).not.toBe(second);
  });

  // MYK9-2501: a second submit from the same flow overwrites its own draft.
  it('reuses the id already in the address, so one flow keeps one draft', () => {
    const first = saveClubOnboardingDraft(draft)!;
    const again = saveClubOnboardingDraft({ ...draft, contactName: 'Sam Lee' }, first);
    expect(again).toBe(first);
    expect(readClubOnboardingDraft(first)?.contactName).toBe('Sam Lee');
  });

  // An old link must never pick up what the next person types (a shared computer).
  it('gives a new id when the address id has no stored draft: cleared, expired or never saved', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-27T12:00:00Z'));
    const cleared = saveClubOnboardingDraft(draft)!;
    clearClubOnboardingDraft(cleared);
    const expired = saveClubOnboardingDraft(draft)!;
    vi.setSystemTime(Date.now() + CLUB_ONBOARDING_DRAFT_MAX_AGE_MS + 1000);
    const unknown = '0b9f1c7e-2d4a-4e8b-9c3f-5a6d7e8f9a0b';

    for (const oldId of [cleared, expired, unknown, '../not-an-id']) {
      const saved = saveClubOnboardingDraft({ ...draft, contactName: 'Next Person' }, oldId);
      expect(saved).not.toBe(oldId);
      expect(readClubOnboardingDraft(oldId)).toBeNull();
      expect(readClubOnboardingDraft(saved)?.contactName).toBe('Next Person');
    }
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
    localStorage.setItem(`${PREFIX}draft-1`, raw);
    expect(readClubOnboardingDraft('draft-1')).toBeNull();
  });
});
