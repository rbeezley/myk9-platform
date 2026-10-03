import { describe, expect, it } from 'vitest';
import { resolveActions } from '@/features/actions/actionRegistry';
import { buildContextualNavigationCommands } from '@/features/command-menu/contextualCommands';
import { getCockpitClassManagementHref } from '@/features/show-map/cockpit/cockpitRoutes';
import { computeSetupReadinessSignals } from '@/features/show-workbench/setupReadinessSignals';
import { buildClassDetailsRelatedLinks } from '@/pages/ClassDetailsPage/classDetailsRelatedLinks';
import { getSelectClassesHref } from '@/pages/secretary/selectClassesRoutes';
import { LEGACY_SHOW_TAB_PARAM_REDIRECTS, SHOW_TABS } from '@/routes/showManagementSections';
import type { Show } from '@/types/show-types';
import type { SyncableTrial } from '@/store/trial-store-types';

// MYK9-924: Class Management is Setup → Classes. The old /shows/:id/classes/:trialId and
// /trials/:trialId/classes URLs stay mounted only as redirects, so nothing the app itself
// builds may point at them. Every in-app link builder is run and every href it produces checked.

const RETIRED_CLASS_MANAGEMENT = [
  /^\/shows\/[^/?#]+\/classes(?:[/?#]|$)/,
  /^\/trials\/[^/?#]+\/classes(?:\/create)?(?:[?#]|$)/,
];

function retiredHrefs(hrefs: string[]): string[] {
  return hrefs.filter(href => RETIRED_CLASS_MANAGEMENT.some(pattern => pattern.test(href)));
}

const viewer = {
  canManageShow: true,
  canOperateShow: true,
  canCreateShows: true,
  isShowManagementStaff: true,
};
const returnTo = '/shows/s1/show-day?filter=in-progress';

function collectHrefs(): string[] {
  const show = { id: 's1', name: 'Show', status: 'draft' } as Show;
  const trials = [{ id: 't1' }] as SyncableTrial[];
  const hrefs: string[] = [];

  for (const shellMounted of [true, false]) {
    for (const action of resolveActions({ kind: 'show', showId: 's1', shellMounted }, viewer)) {
      if (action.href) hrefs.push(action.href);
    }
  }
  for (const tab of SHOW_TABS) hrefs.push(`/shows/s1${tab.path ? `/${tab.path}` : ''}`);
  for (const target of Object.values(LEGACY_SHOW_TAB_PARAM_REDIRECTS)) {
    const search = new URLSearchParams(target.search).toString();
    hrefs.push(`/shows/s1${target.path ? `/${target.path}` : ''}${search ? `?${search}` : ''}`);
  }
  hrefs.push(
    ...buildContextualNavigationCommands({ surface: 'entry-management', showId: 's1' }).flatMap(
      command => ('href' in command && command.href ? [command.href] : [])
    )
  );
  hrefs.push(
    getSelectClassesHref('s1'),
    getSelectClassesHref('s1', 'in_progress', { trialId: 't1', focusClassId: 'c1', returnTo }),
    getCockpitClassManagementHref({ showId: 's1', trialId: 't1', classId: 'c1', returnTo })
  );
  hrefs.push(
    ...computeSetupReadinessSignals({ show, trials, classes: [], judges: [] }).map(s => s.href)
  );
  hrefs.push(
    ...buildClassDetailsRelatedLinks({
      isStaff: true,
      showId: 's1',
      trialId: 't1',
      classId: 'c1',
    }).map(link => link.href)
  );
  return hrefs;
}

describe('in-app links to the retired Class Management route', () => {
  it('finds none among the nav, actions, palette, readiness, cockpit and class-details links', () => {
    const hrefs = collectHrefs();

    // Known-answer control: the builders did produce links, including the Setup → Classes ones.
    expect(hrefs.length).toBeGreaterThan(10);
    expect(hrefs).toContain('/shows/s1/setup?section=classes');

    expect(retiredHrefs(hrefs)).toEqual([]);
  });

  it('would catch a link to the old route', () => {
    expect(
      retiredHrefs([
        '/shows/s1/classes/t1',
        '/shows/s1/classes/t1?focus=c1',
        '/shows/s1/classes/t1/create',
        '/trials/t1/classes',
        '/trials/t1/classes/create',
      ])
    ).toHaveLength(5);
    expect(
      retiredHrefs([
        '/shows/s1/trials/t1/classes/c1',
        '/shows/s1/setup?section=classes',
        '/shows/s1/entries?class=c1',
      ])
    ).toEqual([]);
  });
});
