import { expect, type Page } from '@playwright/test';
import { dataAbsent, requireRead, type RestAuth } from './liveCanary';

/**
 * Shared by the two "one home per class" walks (MYK9-1942, Phase 5): the seeded show-day
 * fixture (`seed_demo_restore_show_day_fixture`, MYK9-731) and the check that a walk never
 * opened the class page.
 */

export const FIXTURE_CLASS_NAME = 'Container Novice A';
const FIXTURE_TIME_ZONE = 'America/Chicago';
// Every row the fixture function mints starts with this id prefix (MYK9-731).
const FIXTURE_ID_FLOOR = 'dededede-0000-0000-0731-000000000000';
const FIXTURE_ID_CEILING = 'dededede-0000-0000-0731-ffffffffffff';

/** The class page: `/shows/:id/trials/:id/classes/:id`, or the legacy `/classes/:id`. */
const CLASS_PAGE_PATH = /^\/(?:shows\/[^/]+\/trials\/[^/]+\/)?classes\/[^/]+\/?$/;

export function todayInFixtureZone(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: FIXTURE_TIME_ZONE }).format(new Date());
}

interface FixtureClassRow {
  id: string;
  trials: { show_id: string; date: string };
}

/** Today's Container Novice A on the show-day fixture show, or the data-absent verdict. */
export async function findFixtureClass(page: Page, auth: RestAuth) {
  const today = todayInFixtureZone();
  const shows = await requireRead<{ id: string }>(
    page,
    auth,
    `shows?select=id&id=gte.${FIXTURE_ID_FLOOR}&id=lte.${FIXTURE_ID_CEILING}&order=start_date.desc&limit=5`
  );
  const showIds = shows.map(show => show.id);
  if (showIds.length === 0) {
    dataAbsent('no show-day fixture show (id prefix dededede-0000-0000-0731-)');
  }
  const classes = await requireRead<FixtureClassRow>(
    page,
    auth,
    `classes?select=id,trials!inner(show_id,date)&trials.show_id=in.(${showIds.join(',')})&trials.date=eq.${today}&name=eq.${encodeURIComponent(FIXTURE_CLASS_NAME)}&limit=1`
  );
  const target = classes[0];
  if (!target) {
    dataAbsent(`the fixture has no ${FIXTURE_CLASS_NAME} dated ${today} (${FIXTURE_TIME_ZONE})`);
  }
  return { showId: target.trials.show_id, classId: target.id, day: today };
}

/**
 * Records every main-frame URL the walk visits. `assertNeverOpenedClassPage` fails with the
 * list if any of them was the class page.
 */
export function watchNavigations(page: Page): () => string[] {
  const visited: string[] = [];
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) visited.push(new URL(frame.url()).pathname);
  });
  return () => visited;
}

export function assertNeverOpenedClassPage(visited: string[]): void {
  const classPages = visited.filter(path => CLASS_PAGE_PATH.test(path));
  expect(classPages, `the walk opened the class page; it visited ${visited.join(' -> ')}`).toEqual(
    []
  );
}

/** Links on the page that point at the class page, by their rendered href. */
export async function classPageLinks(page: Page): Promise<string[]> {
  return page.locator('a[href]').evaluateAll(anchors =>
    anchors
      .map(anchor => new URL((anchor as HTMLAnchorElement).href).pathname)
      // Same shape as CLASS_PAGE_PATH; repeated here because evaluateAll runs in the browser.
      .filter(path => /^\/(?:shows\/[^/]+\/trials\/[^/]+\/)?classes\/[^/]+\/?$/.test(path))
  );
}
