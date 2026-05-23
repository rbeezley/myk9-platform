import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { ShowDeskCloseoutSection } from '../ShowDeskCloseoutSection';
import { buildShowMapTree } from '../showMapTree';
import type { Show } from '@/types/show-types';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { ShowMapClassInput } from '../showMapTypes';

const show = { id: 'show-1', name: 'Spring Trial' } as Show;
const trial = {
  id: 'trial-1',
  showId: 'show-1',
  showName: 'Spring Trial',
  trialDate: '2026-05-11',
  trialNumber: '1',
  status: 'In Progress',
  _version: 1,
  _lastModified: new Date(),
  _lastModifiedBy: 'test',
  _syncStatus: 'synced',
} as SyncableTrial;

function renderWithTree(classes: ShowMapClassInput[], entries: Array<Record<string, unknown>>) {
  const tree = buildShowMapTree({ show, trials: [trial], classes, entries });
  return render(
    <ShowDeskCloseoutSection tree={tree}>
      <div data-testid="closeout-child">closeout body</div>
    </ShowDeskCloseoutSection>
  );
}

// INTENT: Section is a thin gate around hasAnyWrapUpEligibleNode. The gate
// is exhaustively tested in showDeskStatus.test.ts. These tests verify the
// component's render contract: present-when-eligible, absent-otherwise.
describe('ShowDeskCloseoutSection', () => {
  it('renders nothing when no class is wrap-up-eligible (mid-show)', () => {
    renderWithTree(
      [{ id: 'c1', trialId: 'trial-1', name: 'Interior Novice A', status: 'In Progress' }],
      []
    );

    expect(screen.queryByTestId('show-desk-closeout-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('closeout-child')).not.toBeInTheDocument();
  });

  it('renders the closeout section with children when a class is in CLASS_READY_FOR_WRAP_UP', () => {
    // Complete class with no entries → CLASS_READY_FOR_WRAP_UP per
    // classifyClassWrapUpStatus, which is wrap-up-eligible.
    renderWithTree(
      [{ id: 'c1', trialId: 'trial-1', name: 'Interior Novice A', status: 'Complete' }],
      []
    );

    expect(screen.getByTestId('show-desk-closeout-section')).toBeInTheDocument();
    expect(screen.getByTestId('closeout-child')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Closeout' })).toBeInTheDocument();
  });

  it('renders the section when a class needs judge signature (NEEDS_JUDGE_SIGNATURE)', () => {
    // Complete class with scored entries but no judge signatures →
    // NEEDS_JUDGE_SIGNATURE, an urgent wrap-up-eligible state.
    renderWithTree(
      [{ id: 'c1', trialId: 'trial-1', name: 'Interior Novice A', status: 'Complete' }],
      [{ id: 'e1', class_id: 'c1', is_scored: true }]
    );

    expect(screen.getByTestId('show-desk-closeout-section')).toBeInTheDocument();
  });

  it('renders when mixed states include at least one wrap-up-eligible class', () => {
    renderWithTree(
      [
        { id: 'c1', trialId: 'trial-1', name: 'Interior', status: 'In Progress' },
        { id: 'c2', trialId: 'trial-1', name: 'Container', status: 'Complete' },
      ],
      []
    );

    expect(screen.getByTestId('show-desk-closeout-section')).toBeInTheDocument();
  });
});
