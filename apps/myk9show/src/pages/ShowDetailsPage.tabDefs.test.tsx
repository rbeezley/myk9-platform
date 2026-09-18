import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { PrimaryTabs } from '@/components/common/PrimaryTabs';
import {
  buildShowDetailTabDefs,
  buildShowManagementTabDefs,
  countPlacedResultGroups,
  resolveResultsTabCount,
  type ShowDetailTabDefsInput,
} from './ShowDetailsPage.tabDefs';
import { SHOW_TABS } from '@/routes/showManagementSections';
import type { ClassResult } from '@/hooks/queries/useShowResults';

function classResult(classId: string, placementCount: number): ClassResult {
  return {
    classId,
    className: `Class ${classId}`,
    element: 'Container',
    level: 'Novice',
    section: null,
    trialId: 'trial-1',
    resultsReleasedAt: '2026-09-01T00:00:00Z',
    placements: Array.from({ length: placementCount }, (_, i) => ({
      placement: (i + 1) as 1 | 2 | 3 | 4,
      handlerName: 'Test Exhibitor',
      dogName: 'Willow',
      breed: 'Border Collie',
      armband: `${100 + i}`,
    })),
  };
}

const baseInput: ShowDetailTabDefsInput = {
  isAuthenticated: true,
  canShowMap: false,
  trialCount: 4,
  classCount: 10,
  submittedEntryHistoryCount: 0,
  submittedEntryProjectionIsReady: false,
  resultsCount: undefined,
};

/**
 * The badge text rendered after one tab's label in the real tab strip, or null
 * when that tab renders no badge. Reads the rendered DOM, not the tab def.
 */
function renderedBadge(input: ShowDetailTabDefsInput, label: string): string | null {
  render(
    <PrimaryTabs tabs={buildShowDetailTabDefs(input)} value="overview" onValueChange={() => {}} />
  );
  const trigger = screen.getByRole('tab', { name: new RegExp(`^${label}`) });
  const text = (trigger.textContent ?? '').trim();
  expect(text.startsWith(label)).toBe(true);
  const badge = text.slice(label.length).trim();
  return badge === '' ? null : badge;
}

describe('Results tab badge', () => {
  it('renders the number of placed result groups the Results tab shows', () => {
    // Heartland Scent Work Classic as seeded: two classes with placements.
    const results = [classResult('container-novice-a', 3), classResult('interior-adv-prelim', 2)];
    expect(
      renderedBadge({ ...baseInput, resultsCount: countPlacedResultGroups(results) }, 'Results')
    ).toBe('2');
  });

  it('renders 0 for a show with no released results', () => {
    expect(
      renderedBadge({ ...baseInput, resultsCount: countPlacedResultGroups([]) }, 'Results')
    ).toBe('0');
  });

  it('renders no badge at all while the results read is unresolved', () => {
    expect(renderedBadge({ ...baseInput, resultsCount: undefined }, 'Results')).toBeNull();
  });

  it('keeps the sibling badges it renders alongside', () => {
    expect(renderedBadge({ ...baseInput, resultsCount: 2 }, 'Trials')).toBe('4');
  });
});

describe('countPlacedResultGroups', () => {
  it('ignores a group whose placements were withheld', () => {
    expect(countPlacedResultGroups([classResult('a', 2), classResult('b', 0)])).toBe(1);
  });

  it('treats an unloaded read as zero groups', () => {
    expect(countPlacedResultGroups(undefined)).toBe(0);
  });
});

describe('resolveResultsTabCount', () => {
  it('counts a resolved read', () => {
    expect(
      resolveResultsTabCount({ data: [classResult('a', 1)], isLoading: false, isError: false })
    ).toBe(1);
  });

  it('withholds the badge while loading', () => {
    expect(
      resolveResultsTabCount({ data: undefined, isLoading: true, isError: false })
    ).toBeUndefined();
  });

  it('withholds the badge when the read failed', () => {
    expect(
      resolveResultsTabCount({ data: undefined, isLoading: false, isError: true })
    ).toBeUndefined();
  });

  it('withholds the badge when a failed read still holds stale-free empty data', () => {
    expect(resolveResultsTabCount({ data: [], isLoading: false, isError: true })).toBeUndefined();
  });
});

describe("buildShowManagementTabDefs — the secretary's one row of six", () => {
  it('is exactly the six decided tabs, in order', () => {
    expect(
      buildShowManagementTabDefs({
        catalogEntryCount: 517,
        managerEntryDataUnavailable: false,
        resultsCount: 2,
      }).map(tab => tab.label)
    ).toEqual(['Overview', 'Setup', 'Entries', 'Show Day', 'Results', 'Reports']);
  });

  it('carries the six tab ids the route model declares', () => {
    expect(
      buildShowManagementTabDefs({
        catalogEntryCount: 0,
        managerEntryDataUnavailable: false,
        resultsCount: undefined,
      }).map(tab => tab.id)
    ).toEqual(SHOW_TABS.map(tab => tab.id));
  });

  it('badges Entries with the show entry count the page already read', () => {
    const entries = buildShowManagementTabDefs({
      catalogEntryCount: 517,
      managerEntryDataUnavailable: false,
      resultsCount: undefined,
    }).find(tab => tab.id === 'entries');
    expect(entries?.count).toBe(517);
  });

  it('omits the Entries badge rather than showing 0 while that read is unavailable', () => {
    const entries = buildShowManagementTabDefs({
      catalogEntryCount: 0,
      managerEntryDataUnavailable: true,
      resultsCount: undefined,
    }).find(tab => tab.id === 'entries');
    expect(entries?.count).toBeUndefined();
  });

  it('gives Setup no badge — its three views carry three different counts', () => {
    const setup = buildShowManagementTabDefs({
      catalogEntryCount: 5,
      managerEntryDataUnavailable: false,
      resultsCount: 2,
    }).find(tab => tab.id === 'setup');
    expect(setup?.count).toBeUndefined();
  });
});

describe('the Show Map tab on the exhibitor strip', () => {
  // #2180 put club admins on the EXHIBITOR surface deliberately, and
  // `canShowMap = features.showMap && canManageShow` is true for them. Before
  // MYK9-630 phase 2 that strip carried their Show Map; a site admin or scoped
  // secretary now gets it inside the Setup tab instead. Dropping it here took
  // the map away from club admins entirely.
  it('offers a Show Map to a viewer who may see one', () => {
    expect(buildShowDetailTabDefs({ ...baseInput, canShowMap: true }).map(tab => tab.id)).toContain(
      'map'
    );
  });

  it('offers none to a viewer who may not', () => {
    expect(
      buildShowDetailTabDefs({ ...baseInput, canShowMap: false }).map(tab => tab.id)
    ).not.toContain('map');
  });

  it('puts it directly after Overview, where it has always been', () => {
    expect(
      buildShowDetailTabDefs({ ...baseInput, canShowMap: true })
        .slice(0, 2)
        .map(tab => tab.id)
    ).toEqual(['overview', 'map']);
  });
});
