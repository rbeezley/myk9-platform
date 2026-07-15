import { describe, expect, it } from 'vitest';
import {
  getClassDayOfHref,
  getClassMissingInformationHref,
  getClassPaymentDueHref,
  getClassReviewHref,
  getClassScoringHref,
} from './entryAttentionRoutes';

const context = { showId: 'show/1', trialId: 'trial-1', classId: 'class-1' };

describe('entry attention routes', () => {
  it('preserves show, trial, class, and pending-review context', () => {
    expect(getClassReviewHref(context)).toBe(
      '/shows/show%2F1/entry-management?mode=review&attention=pending&trial=trial-1&class=class-1'
    );
  });

  it('routes missing information to its exact class-scoped filter', () => {
    expect(getClassMissingInformationHref(context)).toContain('attention=missing_information');
  });

  it('stacks accepted and payment-due filters so pending review rows do not leak in', () => {
    expect(getClassPaymentDueHref(context)).toBe(
      '/shows/show%2F1/entry-management?mode=review&attention=accepted&payment=pending&trial=trial-1&class=class-1'
    );
  });

  it('builds day-of and scoring destinations through shared helpers', () => {
    expect(getClassDayOfHref(context)).toContain('mode=day-of');
    expect(getClassScoringHref('class-1')).toBe('/scoring/classes/class-1/entries?mode=split');
  });
});
