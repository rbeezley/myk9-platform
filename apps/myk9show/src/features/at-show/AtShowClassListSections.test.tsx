import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { AtShowClassListSections } from './AtShowClassListSections';

function renderEmpty(tab: 'completed' | 'pending', searching: boolean) {
  render(
    <AtShowClassListSections
      tab={tab}
      searching={searching}
      yourRing={[]}
      byTrial={[]}
      scopeToAssignedClasses={false}
      collapsedTrialIds={new Set()}
      onToggleTrial={vi.fn()}
      cardProps={() => {
        throw new Error('no cards expected');
      }}
    />
  );
}

describe('AtShowClassListSections empty copy', () => {
  it('says no completed classes yet on an empty Completed tab with no search', () => {
    renderEmpty('completed', false);
    expect(screen.getByText('No completed classes yet.')).toBeInTheDocument();
  });

  it('says nothing matches when a search is active, even on Completed', () => {
    renderEmpty('completed', true);
    expect(
      screen.getByText('No classes match. Try another tab, or clear the search.')
    ).toBeInTheDocument();
    expect(screen.queryByText('No completed classes yet.')).not.toBeInTheDocument();
  });

  it('says nothing matches on any other empty tab', () => {
    renderEmpty('pending', false);
    expect(
      screen.getByText('No classes match. Try another tab, or clear the search.')
    ).toBeInTheDocument();
  });
});
