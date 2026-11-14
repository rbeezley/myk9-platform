import { describe, expect, it } from 'vitest';

import {
  getCockpitFinishListHref,
  withReturnTo,
  getCockpitClassDetailsHref,
  getCockpitJudgeDayCatalogHref,
  getCockpitPaperScoringHref,
  getCockpitReportHref,
  getCockpitResultsControlHref,
  getCockpitSubmitResultsHref,
  getShowHomeHref,
  getShowHomeTrialHref,
  leaveSelectClassesSearch,
  selectClassesAnchor,
  normalizeCockpitUrlState,
  resolveShowDeskReturn,
  writeCockpitUrlState,
} from './cockpitRoutes';

function resolveShowDeskReturnHref(candidate: string, showId: string): string | null {
  return resolveShowDeskReturn(candidate, showId)?.href ?? null;
}

const context = {
  selectedDays: ['2026-07-20'],
  statuses: ['needs-attention'] as const,
  focusedClassId: 'class/1',
  anchor: 'trial-1',
};

describe('Show Desk context routes', () => {
  it('reads the old single filter, a comma list and junk; writes a sorted list (MYK9-1727)', () => {
    const read = (query: string) => normalizeCockpitUrlState(new URLSearchParams(query)).statuses;
    expect(read('filter=needs-attention')).toEqual(['needs-attention']);
    expect(read('filter=needs-closeout,in-progress,in-progress')).toEqual([
      'in-progress',
      'needs-closeout',
    ]);
    expect(read('filter=all')).toEqual([]);
    expect(read('filter=bad,in-progress')).toEqual(['in-progress']);
    expect(read('filter=')).toEqual([]);
    expect(read('')).toEqual([]);

    const write = (statuses: readonly ('in-progress' | 'needs-attention' | 'needs-closeout')[]) =>
      writeCockpitUrlState(new URLSearchParams(), { statuses }).toString();
    expect(write(['needs-closeout', 'in-progress'])).toBe('filter=in-progress%2Cneeds-closeout');
    expect(write([])).toBe('');
  });

  it('reads and writes the lifecycle statuses and the Judge, element and level params (MYK9-1785)', () => {
    const state = normalizeCockpitUrlState(
      new URLSearchParams(
        'filter=complete,not-started,cancelled&judge=j2,j1&element=Interior&level=Novice,Advanced'
      )
    );
    expect(state).toMatchObject({
      statuses: ['cancelled', 'complete', 'not-started'],
      judges: ['j1', 'j2'],
      elements: ['Interior'],
      levels: ['Advanced', 'Novice'],
    });
    expect(writeCockpitUrlState(new URLSearchParams('tool=x'), state).toString()).toBe(
      'filter=cancelled%2Ccomplete%2Cnot-started&judge=j1%2Cj2&element=Interior&level=Advanced%2CNovice&tool=x'
    );
    // Clear all: every group empty writes none of the params.
    expect(
      writeCockpitUrlState(new URLSearchParams(), {
        ...state,
        selectedDays: [],
        statuses: [],
        judges: [],
        elements: [],
        levels: [],
      }).toString()
    ).toBe('');
  });

  it('ignores a retired ?area= param and does not write it back', () => {
    const state = normalizeCockpitUrlState(new URLSearchParams('area=Ring%201&judge=j1'));
    expect(state).toEqual({
      selectedDays: [],
      statuses: [],
      judges: ['j1'],
      elements: [],
      levels: [],
    });
    expect(writeCockpitUrlState(new URLSearchParams(), state).toString()).toBe('judge=j1');
  });

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
      selectedDays: ['2026-07-20'],
      statuses: [],
      judges: [],
      elements: [],
      levels: [],
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
      writeCockpitUrlState(previous, { ...context, selectedDays: ['2026-07-21'] }).toString()
    ).toBe(
      'day=2026-07-21&filter=needs-attention&focus=class%2F1&anchor=trial-1&tool=people-at-show&view=needs-check-in'
    );
  });

  it('builds typed owner links with the exact scope and encoded return context', () => {
    const returnTo = getShowHomeHref({ showId: 'show-1', state: context });

    expect(getCockpitPaperScoringHref({ classId: 'class/1', returnTo })).toBe(
      `/scoring/classes/class%2F1/entries?returnTo=${encodeURIComponent(returnTo)}`
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
    expect(normalizeCockpitUrlState(new URLSearchParams()).selectedDays).toEqual([]);
    expect(
      writeCockpitUrlState(new URLSearchParams(), { selectedDays: [], statuses: [] }).toString()
    ).toBe('');
  });

  it('MYK9-1719: writes ticked days comma-joined and sorted, and reads them back', () => {
    const written = writeCockpitUrlState(new URLSearchParams(), {
      selectedDays: ['2026-11-07', '2026-11-06'],
      statuses: [],
    });
    expect(written.get('day')).toBe('2026-11-06,2026-11-07');
    expect(normalizeCockpitUrlState(written).selectedDays).toEqual(['2026-11-06', '2026-11-07']);
  });

  it('MYK9-1719: reads a legacy single day, and drops invalid entries from a list', () => {
    expect(normalizeCockpitUrlState(new URLSearchParams('day=2026-11-06')).selectedDays).toEqual([
      '2026-11-06',
    ]);
    expect(
      normalizeCockpitUrlState(new URLSearchParams('day=bad,2026-11-07,2026-11-6,2026-11-07'))
        .selectedDays
    ).toEqual(['2026-11-07']);
    expect(normalizeCockpitUrlState(new URLSearchParams('day=all')).selectedDays).toEqual([]);
  });

  it('MYK9-1719: deep links that name one date still write a single `day`', () => {
    expect(getShowHomeTrialHref('show-1', { id: 'trial-1', date: '2026-11-06' })).toBe(
      '/shows/show-1?day=2026-11-06&anchor=trial-1'
    );
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

  it("Done drops only the mode's own params when nothing says where to go back", () => {
    // `focus` and `filter` are the schedule's: the focused class and the filter stay.
    expect(leave('select=classes&trialId=trial-1&focus=class-1&filter=in-progress')).toBe(
      'focus=class-1&filter=in-progress'
    );
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
      { selectedDays: ['2026-10-10'], statuses: [], focusedClassId: undefined, anchor: undefined }
    );
    expect(written.get('select')).toBe('classes');
    expect(written.get('returnTo')).toBe('/shows/show-1');
    expect(written.get('day')).toBe('2026-10-10');

    expect(
      writeCockpitUrlState(new URLSearchParams('returnTo=%2Fshows%2Fshow-1'), {
        selectedDays: undefined,
        statuses: [],
        focusedClassId: undefined,
        anchor: undefined,
      }).get('returnTo')
    ).toBeNull();
  });
});

describe('the Finish the show list link (MYK9-1945)', () => {
  it('lands on the list, with returnTo ahead of the fragment', () => {
    expect(getCockpitFinishListHref({ showId: 'show-1' })).toBe(
      '/shows/show-1/results#finish-the-show'
    );
    expect(withReturnTo('/shows/show-1/results#finish-the-show', '/shows/show-1')).toBe(
      '/shows/show-1/results?returnTo=%2Fshows%2Fshow-1#finish-the-show'
    );
  });
});
