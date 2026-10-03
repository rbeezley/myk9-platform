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

// MYK9-924: Class Management became Setup → Classes; MYK9-957 folded Setup and Show Day into
// the show home (`/shows/:id`, Select classes at `?select=classes`). The old Class Management,
// Setup, Show Day and Show Desk URLs stay mounted only as redirects, so nothing the app itself
// builds may point at them. Every in-app link builder is run and every href it produces checked.

const RETIRED_CLASS_MANAGEMENT = [
  /^\/shows\/[^/?#]+\/classes(?:[/?#]|$)/,
  /^\/trials\/[^/?#]+\/classes(?:\/create)?(?:[?#]|$)/,
  /^\/shows\/[^/?#]+\/(?:setup|show-day|show-desk)(?:[/?#]|$)/,
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
    getSelectClassesHref('s1', 'in_progress', { trialId: 't1', focusClassId: 'c1' }),
    getCockpitClassManagementHref({
      showId: 's1',
      trialId: 't1',
      classId: 'c1',
      returnTo: '/shows/s1',
    })
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

describe('in-app links to retired show routes (Class Management, Setup, Show Day)', () => {
  it('finds none among the nav, actions, palette, readiness, cockpit and class-details links', () => {
    const hrefs = collectHrefs();

    // Known-answer control: the builders did produce links, including the Select classes ones.
    expect(hrefs.length).toBeGreaterThan(10);
    expect(hrefs).toContain('/shows/s1?select=classes');

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
        '/shows/s1/setup?section=classes',
        '/shows/s1/show-day?tool=people-at-show',
        '/shows/s1/show-desk',
      ])
    ).toHaveLength(8);
    expect(
      retiredHrefs([
        '/shows/s1/trials/t1/classes/c1',
        '/shows/s1?select=classes',
        '/shows/s1?tool=people-at-show',
        '/shows/s1/entries?class=c1',
      ])
    ).toEqual([]);
  });
});
