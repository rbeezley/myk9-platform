import { describe, expect, it } from 'vitest';

import {
  getCockpitClassDetailsHref,
  getCockpitClassManagementHref,
  getCockpitEntryManagementHref,
  getCockpitPaperScoringHref,
  getCockpitReportHref,
  getCockpitResultsControlHref,
  getCockpitSubmitResultsHref,
  getShowDeskHref,
  normalizeCockpitUrlState,
  resolveShowDeskReturnHref,
  writeCockpitUrlState,
} from './cockpitRoutes';

const context = {
  selectedDay: '2026-07-20',
  filter: 'needs-attention' as const,
  focusedClassId: 'class/1',
  anchor: 'trial-1',
};

describe('Show Desk context routes', () => {
  it('builds and normalizes URL-backed day, filter, focus, and anchor state', () => {
    const href = getShowDeskHref({ showId: 'show 1', state: context });
    expect(href).toBe(
      '/shows/show%201/show-desk?day=2026-07-20&filter=needs-attention&focus=class%2F1&anchor=trial-1'
    );

    expect(
      normalizeCockpitUrlState(
        new URLSearchParams('day=2026-07-20&filter=bad&focus=class-1&anchor=trial-1')
      )
    ).toEqual({
      selectedDay: '2026-07-20',
      filter: 'all',
      focusedClassId: 'class-1',
      anchor: 'trial-1',
    });
  });

  it('preserves a deep-linked Show Desk tool while cockpit focus initializes', () => {
    const previous = new URLSearchParams('tool=people-at-show');

    expect(writeCockpitUrlState(previous, context).toString()).toBe(
      'day=2026-07-20&filter=needs-attention&focus=class%2F1&anchor=trial-1&tool=people-at-show'
    );
  });

  it('builds typed owner links with the exact scope and encoded return context', () => {
    const returnTo = getShowDeskHref({ showId: 'show-1', state: context });

    expect(
      getCockpitEntryManagementHref({
        showId: 'show-1',
        trialId: 'trial-1',
        classId: 'class/1',
        tab: 'move-ups',
        returnTo,
      })
    ).toBe(
      `/shows/show-1/entry-management?tab=move-ups&trial=trial-1&class=class%2F1&returnTo=${encodeURIComponent(returnTo)}`
    );

    expect(
      getCockpitClassManagementHref({
        showId: 'show-1',
        trialId: 'trial-1',
        classId: 'class/1',
        returnTo,
      })
    ).toBe(
      `/shows/show-1/classes/trial-1?focus=class%2F1&returnTo=${encodeURIComponent(returnTo)}`
    );

    expect(getCockpitPaperScoringHref({ classId: 'class/1', returnTo })).toBe(
      `/scoring/classes/class%2F1/entries?mode=split&returnTo=${encodeURIComponent(returnTo)}`
    );

    expect(
      getCockpitReportHref({
        reportId: 'result-labels',
        scope: {
          kind: 'class',
          showId: 'show-1',
          trialId: 'trial-1',
          classId: 'class/1',
        },
        returnTo,
      })
    ).toBe(
      `/shows/show-1/reports?trialId=trial-1&classId=class%2F1&report=result-labels&returnTo=${encodeURIComponent(returnTo)}`
    );

    expect(
      getCockpitResultsControlHref({
        showId: 'show-1',
        trialId: 'trial-1',
        classId: 'class/1',
        returnTo,
      })
    ).toBe(
      `/shows/show-1/results-control?trialId=trial-1&classId=class%2F1&returnTo=${encodeURIComponent(returnTo)}`
    );

    expect(getCockpitSubmitResultsHref({ showId: 'show-1', trialId: 'trial-1', returnTo })).toBe(
      `/shows/show-1/submit-results?trialId=trial-1&returnTo=${encodeURIComponent(returnTo)}`
    );

    expect(
      getCockpitClassDetailsHref({
        showId: 'show-1',
        trialId: 'trial-1',
        classId: 'class/1',
        returnTo,
      })
    ).toBe(
      `/shows/show-1/trials/trial-1/classes/class%2F1?returnTo=${encodeURIComponent(returnTo)}`
    );
  });

  it('accepts only a same-Show internal Show Desk return and canonicalizes its state', () => {
    const valid =
      '/shows/show-1/show-desk?focus=class-1&filter=in-progress&day=2026-07-20&anchor=row-2';
    expect(resolveShowDeskReturnHref(valid, 'show-1')).toBe(
      '/shows/show-1/show-desk?day=2026-07-20&filter=in-progress&focus=class-1&anchor=row-2'
    );
    expect(resolveShowDeskReturnHref('https://evil.example', 'show-1')).toBeNull();
    expect(resolveShowDeskReturnHref('//evil.example/shows/show-1/show-desk', 'show-1')).toBeNull();
    expect(resolveShowDeskReturnHref('/shows/show-2/show-desk', 'show-1')).toBeNull();
    expect(resolveShowDeskReturnHref('/shows/show-1/reports', 'show-1')).toBeNull();
  });
});
