import { describe, expect, it } from 'vitest';
import {
  getClassDayOfHref,
  getEntryManagementHref,
  getClassMissingInformationHref,
  getClassPaymentDueHref,
  getClassReviewHref,
  getClassScoringHref,
} from './entryAttentionRoutes';

const context = { showId: 'show/1', trialId: 'trial-1', classId: 'class-1' };

describe('entry attention routes', () => {
  it('preserves show, trial, class, and pending-review context', () => {
    expect(getClassReviewHref(context)).toBe(
      '/shows/show%2F1/entries?mode=review&attention=pending&trial=trial-1&class=class-1'
    );
  });

  it('routes missing information to its exact class-scoped filter', () => {
    expect(getClassMissingInformationHref(context)).toContain('attention=missing_information');
  });

  it('stacks accepted and payment-due filters so pending review rows do not leak in', () => {
    expect(getClassPaymentDueHref(context)).toBe(
      '/shows/show%2F1/entries?mode=review&attention=accepted&payment=pending&trial=trial-1&class=class-1'
    );
  });

  it('builds day-of and scoring destinations through shared helpers', () => {
    expect(getClassDayOfHref(context)).toContain('mode=day-of');
    expect(getClassScoringHref('class-1')).toBe('/scoring/classes/class-1/entries?mode=split');
  });
});

describe('getEntryManagementHref queue', () => {
  it('names the all queue for a bare trial or class scope so an accepted class is not empty', () => {
    expect(getEntryManagementHref({ showId: 's', trialId: 't', classId: 'c' })).toBe(
      '/shows/s/entries?trial=t&class=c&queue=all'
    );
    expect(getEntryManagementHref({ showId: 's', trialId: 't' })).toBe(
      '/shows/s/entries?trial=t&queue=all'
    );
  });

  it('keeps the triage default for show-wide links and never overrides an explicit filter', () => {
    expect(getEntryManagementHref({ showId: 's' })).toBe('/shows/s/entries');
    expect(
      getEntryManagementHref({ showId: 's', trialId: 't', attention: 'pending' })
    ).not.toContain('queue=');
    expect(getEntryManagementHref({ showId: 's', trialId: 't', tab: 'waitlist' })).not.toContain(
      'queue='
    );
  });
});
