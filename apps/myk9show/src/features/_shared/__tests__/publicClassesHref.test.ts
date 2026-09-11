import { describe, it, expect } from 'vitest';
import { fromAny } from '@total-typescript/shoehorn';
import type { Show } from '@/types/show-types';
import { publicClassesHref } from '../publicClassesHref';

const show = (trials: unknown[]): Show => fromAny<Show, unknown>({ id: 'show-1', trials });

const withClasses = show([
  { id: 'trial-a', name: 'Saturday', classes: [{ id: 'c1', element: 'Interior' }] },
  { id: 'trial-b', name: 'Sunday', classes: [{ id: 'c2', element: 'Vehicle' }] },
]);

describe('publicClassesHref', () => {
  /**
   * The destination changed deliberately (MYK9-466). It used to be
   * `/shows/:id/trials/:firstTrialId`, which showed only the FIRST trial's
   * elements and which also publishes the entry list to anonymous visitors.
   * It is now a section inside the premium listing every trial.
   */
  it('points at the offered-classes section inside the premium', () => {
    expect(publicClassesHref(withClasses)).toBe('#offered-classes');
  });

  it('never points at the auth-gated registration wizard', () => {
    // The original reason this helper exists: a cold exhibitor sent to
    // /register is bounced to /sign-in and loses the show.
    expect(publicClassesHref(withClasses)).not.toContain('/register');
  });

  it('stays in the premium rather than linking out to a trial page', () => {
    const href = publicClassesHref(withClasses);
    expect(href).not.toContain('/trials/');
    expect(href?.startsWith('#')).toBe(true);
  });

  it('returns null when no trial has classes, so the link hides', () => {
    // Matches OfferedClassesSection, which renders nothing in this case —
    // a link to an absent anchor would scroll nowhere.
    expect(publicClassesHref(show([{ id: 'trial-a', classes: [] }]))).toBeNull();
    expect(publicClassesHref(show([]))).toBeNull();
  });

  it('returns null for a missing show', () => {
    expect(publicClassesHref(null)).toBeNull();
    expect(publicClassesHref(undefined)).toBeNull();
  });
});
