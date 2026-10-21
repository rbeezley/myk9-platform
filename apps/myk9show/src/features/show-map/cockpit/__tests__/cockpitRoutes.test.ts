import { describe, expect, it } from 'vitest';
import { getShowHomeTrialHref, normalizeCockpitUrlState } from '../cockpitRoutes';

describe('getShowHomeTrialHref (MYK9-1320)', () => {
  it('opens the trial by choosing its day and anchoring on its header', () => {
    expect(getShowHomeTrialHref('show-1', { id: 'trial-1', date: '2026-05-01' })).toBe(
      '/shows/show-1?day=2026-05-01&anchor=trial-1'
    );
  });

  it('keeps All days and still anchors when the trial has no usable date', () => {
    expect(getShowHomeTrialHref('show-1', { id: 'trial-1' })).toBe('/shows/show-1?anchor=trial-1');
    expect(getShowHomeTrialHref('show-1', { id: 'trial-1', date: 'May 1' })).toBe(
      '/shows/show-1?anchor=trial-1'
    );
  });

  it('round-trips through the cockpit URL reader', () => {
    const href = getShowHomeTrialHref('show-1', { id: 'trial-1', date: '2026-05-01' });
    const state = normalizeCockpitUrlState(new URL(href, 'https://x.test').searchParams);
    expect(state).toMatchObject({ selectedDay: '2026-05-01', anchor: 'trial-1', filter: 'all' });
  });
});
