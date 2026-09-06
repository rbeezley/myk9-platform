import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { PrimaryTabs } from '@/components/common/PrimaryTabs';
import {
  buildShowDetailTabDefs,
  countPlacedResultGroups,
  resolveResultsTabCount,
  type ShowDetailTabDefsInput,
} from './ShowDetailsPage.tabDefs';
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
  canManageShow: false,
  trialCount: 4,
  classCount: 10,
  catalogEntryCount: 0,
  managerEntryDataUnavailable: true,
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
