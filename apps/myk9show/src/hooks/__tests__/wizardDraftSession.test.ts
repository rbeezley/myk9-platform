import { describe, it, expect, beforeEach } from 'vitest';
import {
  WIZARD_SESSION_MAX_DRAFT_AGE_MS,
  clearWizardSession,
  hasWizardSession,
  markWizardSessionOpen,
  pickRehydratableDraft,
  wizardSessionKey,
} from '../wizardDraftSession';
import type { DraftMetadata } from '../draftMetadata';

const draft = (over: Partial<DraftMetadata>): DraftMetadata => ({
  id: 'd1',
  showId: 'show-1',
  userId: 'user-1',
  timestamp: Date.now(),
  stepCompleted: 'class-selection',
  title: 'Draft',
  preview: '1 dog',
  selectedDogsCount: 1,
  completed: false,
  ...over,
});

describe('wizard same-tab session marker', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('scopes the marker to one show and one user', () => {
    markWizardSessionOpen('show-1', 'user-1');
    expect(hasWizardSession('show-1', 'user-1')).toBe(true);
    // A different exhibitor on the same device, and the same exhibitor on a
    // different show, must both read as a fresh visit.
    expect(hasWizardSession('show-1', 'user-2')).toBe(false);
    expect(hasWizardSession('show-2', 'user-1')).toBe(false);
    expect(wizardSessionKey('show-1', 'user-1')).toBe('registration-wizard-open-show-1-user-1');
  });

  it('clears the marker', () => {
    markWizardSessionOpen('show-1', 'user-1');
    clearWizardSession('show-1', 'user-1');
    expect(hasWizardSession('show-1', 'user-1')).toBe(false);
  });
});

describe('pickRehydratableDraft', () => {
  const now = 1_700_000_000_000;

  it('returns nothing when there is no draft', () => {
    expect(pickRehydratableDraft([], now)).toBeNull();
  });

  it('skips a dogless draft — it can never be resumed', () => {
    expect(
      pickRehydratableDraft([draft({ selectedDogsCount: 0, timestamp: now })], now)
    ).toBeNull();
  });

  it('skips a completed entry rather than reopening a filed one', () => {
    expect(pickRehydratableDraft([draft({ completed: true, timestamp: now })], now)).toBeNull();
  });

  it('skips a draft older than the same-sitting window', () => {
    const stale = draft({ timestamp: now - WIZARD_SESSION_MAX_DRAFT_AGE_MS - 1 });
    expect(pickRehydratableDraft([stale], now)).toBeNull();
    const fresh = draft({ timestamp: now - WIZARD_SESSION_MAX_DRAFT_AGE_MS + 1 });
    expect(pickRehydratableDraft([fresh], now)?.id).toBe('d1');
  });

  it('picks the newest eligible draft, not the first listed', () => {
    const picked = pickRehydratableDraft(
      [
        draft({ id: 'older', timestamp: now - 5000 }),
        draft({ id: 'newest', timestamp: now - 10 }),
        draft({ id: 'newer-but-completed', timestamp: now, completed: true }),
      ],
      now
    );
    expect(picked?.id).toBe('newest');
  });
});
