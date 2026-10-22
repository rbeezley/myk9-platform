import { describe, expect, it } from 'vitest';

import {
  getCockpitClassDetailsHref,
  getCockpitEntryManagementHref,
  getCockpitJudgeDayCatalogHref,
  getCockpitPaperScoringHref,
  getCockpitReportHref,
  getCockpitResultsControlHref,
  getCockpitSubmitResultsHref,
  getShowHomeHref,
  leaveSelectClassesSearch,
  selectClassesAnchor,
  writeCockpitUrlState,
  normalizeCockpitUrlState,
  resolveShowDeskReturn,
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
    const href = getShowHomeHref({ showId: 'show 1', state: context });
    expect(href).toBe(
      '/shows/show%201?day=2026-07-20&filter=needs-attention&focus=class%2F1&anchor=trial-1'
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

  it('MYK9-825/826: preserves the People-at-show roster view through a cockpit URL rewrite', () => {
    // The roster's own `view=needs-check-in` (renamed from `rosterFilter` by
    // MYK9-812) rides in a param distinct from this cockpit's own `filter`.
    // A day/focus/anchor change elsewhere on the cockpit calls
    // writeCockpitUrlState again with a CockpitUrlState that has no concept
    // of `view` — it must survive that rewrite untouched, not just the
    // initial navigation.
    const previous = new URLSearchParams('tool=people-at-show&view=needs-check-in');

    expect(
      writeCockpitUrlState(previous, { ...context, selectedDay: '2026-07-21' }).toString()
    ).toBe(
      'day=2026-07-21&filter=needs-attention&focus=class%2F1&anchor=trial-1&tool=people-at-show&view=needs-check-in'
    );
  });

  it('builds typed owner links with the exact scope and encoded return context', () => {
    const returnTo = getShowHomeHref({ showId: 'show-1', state: context });

    expect(
      getCockpitEntryManagementHref({
        showId: 'show-1',
        trialId: 'trial-1',
        classId: 'class/1',
        tab: 'move-ups',
        returnTo,
      })
    ).toBe(
      `/shows/show-1/entries?tab=move-ups&trial=trial-1&class=class%2F1&returnTo=${encodeURIComponent(returnTo)}`
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
      `/shows/show-1/results?trialId=trial-1&classId=class%2F1&returnTo=${encodeURIComponent(returnTo)}`
    );

    expect(getCockpitSubmitResultsHref({ showId: 'show-1', trialId: 'trial-1', returnTo })).toBe(
      `/shows/show-1/results?step=submit&trialId=trial-1&returnTo=${encodeURIComponent(returnTo)}`
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
      '/shows/show-1/show-day?focus=class-1&filter=in-progress&day=2026-07-20&anchor=row-2';
    expect(resolveShowDeskReturnHref(valid, 'show-1')).toBe(
      '/shows/show-1?day=2026-07-20&filter=in-progress&focus=class-1&anchor=row-2'
    );
    expect(resolveShowDeskReturnHref('https://evil.example', 'show-1')).toBeNull();
    expect(resolveShowDeskReturnHref('//evil.example/shows/show-1/show-day', 'show-1')).toBeNull();
    expect(resolveShowDeskReturnHref('/shows/show-2/show-day', 'show-1')).toBeNull();
    expect(resolveShowDeskReturnHref('/shows/show-1/reports', 'show-1')).toBeNull();
  });

  // MYK9-955: the show home (/shows/:id) is a cockpit origin too, so a deep
  // link opened from it returns there, named for what it is.
  it('returns to the show home, keeping its state, as "Back to show"', () => {
    expect(resolveShowDeskReturn('/shows/show-1?focus=class-1&anchor=class-1', 'show-1')).toEqual({
      href: '/shows/show-1?focus=class-1&anchor=class-1',
      label: 'Back to show',
    });
    // A retired Show Day returnTo in an open tab returns to the home too (MYK9-957).
    expect(resolveShowDeskReturn('/shows/show-1/show-day', 'show-1')).toEqual({
      href: '/shows/show-1',
      label: 'Back to show',
    });
    expect(resolveShowDeskReturn('/shows/show-2', 'show-1')).toBeNull();
    expect(resolveShowDeskReturn('/shows/show-1/entries', 'show-1')).toBeNull();
  });

  it('treats a missing day as All days and never writes it back', () => {
    expect(normalizeCockpitUrlState(new URLSearchParams()).selectedDay).toBe('all');
    expect(
      writeCockpitUrlState(new URLSearchParams(), { selectedDay: 'all', filter: 'all' }).toString()
    ).toBe('');
  });

  it('still accepts the LEGACY /show-desk spelling and canonicalizes it forward', () => {
    // MYK9-630 phase 2 renamed the route. A `returnTo` captured before it
    // shipped is still sitting in an open tab, and rejecting it silently drops
    // the secretary's way back. The output is rebuilt from the allowlist, so it
    // comes back as the show home (MYK9-957), not as the URL that went in.
    expect(
      resolveShowDeskReturnHref('/shows/show-1/show-desk?filter=needs-attention', 'show-1')
    ).toBe('/shows/show-1?filter=needs-attention');
  });

  it('gives the legacy spelling no more trust than the current one', () => {
    expect(resolveShowDeskReturnHref('//evil.example/shows/show-1/show-desk', 'show-1')).toBeNull();
    expect(
      resolveShowDeskReturnHref('https://evil.example/shows/show-1/show-desk', 'show-1')
    ).toBeNull();
    expect(resolveShowDeskReturnHref('/shows/show-2/show-desk', 'show-1')).toBeNull();
  });
});

describe('getCockpitJudgeDayCatalogHref (MYK9-1036)', () => {
  it('opens the Result Catalog on one judge and one day, keyed on the judge id', () => {
    expect(
      getCockpitJudgeDayCatalogHref({
        showId: 'show-1',
        judgeId: 'judge/1',
        date: '2026-10-10',
        returnTo: '/shows/show-1/results',
      })
    ).toBe(
      `/shows/show-1/reports?report=result-catalog&judgeId=judge%2F1&day=2026-10-10&returnTo=${encodeURIComponent('/shows/show-1/results')}`
    );
  });
});

describe('Select classes on the schedule (MYK9-1324)', () => {
  const leave = (search: string) =>
    leaveSelectClassesSearch(new URLSearchParams(search), 'show-1').toString();

  it('Done drops the mode and its params when nothing says where to go back', () => {
    expect(leave('select=classes&trialId=trial-1&view=pending&focus=class-1')).toBe('');
  });

  it('Done restores the cockpit day, filter and focus it was opened from (Codex P2)', () => {
    const back = '/shows/show-1?day=2026-10-10&filter=needs-attention&focus=class-1';
    expect(leave(`select=classes&trialId=trial-1&returnTo=${encodeURIComponent(back)}`)).toBe(
      'day=2026-10-10&filter=needs-attention&focus=class-1'
    );
  });

  it("Done ignores a returnTo that is not this show's home", () => {
    const foreign = encodeURIComponent('/shows/other?day=2026-10-10');
    expect(leave(`select=classes&returnTo=${foreign}`)).toBe('');
  });

  it("anchors on a Select classes link's class, else its trial, and only in the mode", () => {
    const anchor = (search: string) => selectClassesAnchor(new URLSearchParams(search));
    expect(anchor('select=classes&trialId=trial-1&focus=class-1')).toBe('class-1');
    expect(anchor('select=classes&trialId=trial-1')).toBe('trial-1');
    expect(anchor('trialId=trial-1')).toBeUndefined();
  });

  it("the cockpit's own URL writes keep the mode and its returnTo", () => {
    const written = writeCockpitUrlState(
      new URLSearchParams('select=classes&returnTo=%2Fshows%2Fshow-1'),
      { selectedDay: '2026-10-10', filter: 'all', focusedClassId: undefined, anchor: undefined }
    );
    expect(written.get('select')).toBe('classes');
    expect(written.get('returnTo')).toBe('/shows/show-1');
    expect(written.get('day')).toBe('2026-10-10');

    expect(
      writeCockpitUrlState(new URLSearchParams('returnTo=%2Fshows%2Fshow-1'), {
        selectedDay: undefined,
        filter: 'all',
        focusedClassId: undefined,
        anchor: undefined,
      }).get('returnTo')
    ).toBeNull();
  });
});
