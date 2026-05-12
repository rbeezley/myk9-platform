import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import ShowMapTab from '../ShowMapTab';
import type { Show } from '@/types/show-types';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { ShowMapTree } from '../showMapTypes';

vi.mock('../ShowMapCanvas', () => ({
  ShowMapCanvas: ({
    tree,
    expandedNodeIds,
    onToggle,
  }: {
    tree: ShowMapTree;
    expandedNodeIds: Set<string>;
    onToggle: (nodeId: string) => void;
  }) => (
    <div data-testid="map-canvas">
      {Object.values(tree.nodesById).map(node => (
        <button key={node.id} type="button" onClick={() => onToggle(node.id)}>
          {expandedNodeIds.has(node.id) ? 'expanded ' : 'collapsed '}
          {node.label}
        </button>
      ))}
    </div>
  ),
}));

const show = { id: 'show-1', name: 'Spring Trial', clubName: 'Calm Canine Club' } as Show;
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

describe('ShowMapTab', () => {
  it('renders the show map with root, trial, class, and capped entries', async () => {
    const entries = Array.from({ length: 27 }, (_, index) => ({
      id: `entry-${index}`,
      class_id: 'class-1',
      run_order: index,
      armband: String(index + 1),
      dog: { call_name: `Dog ${index}` },
    }));

    const { user } = render(
      <ShowMapTab
        show={show}
        trials={[trial]}
        classes={[
          {
            id: 'class-1',
            trialId: 'trial-1',
            name: 'Interior Novice A',
            status: 'In Progress',
          },
        ]}
        entries={entries}
        canManageShow
      />
    );

    expect(screen.getByTestId('map-canvas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /expanded spring trial/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /collapsed interior novice a/i }));
    expect(screen.getByRole('button', { name: /2 more entries/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /show list/i }));

    expect(screen.getByText('Interior Novice A')).toBeInTheDocument();
    expect(screen.getByText('2 more entries')).toBeInTheDocument();
  });

  it('renders a calm empty state for shows without trials', () => {
    render(
      <ShowMapTab show={show} trials={[]} classes={[]} entries={[]} canManageShow />
    );

    expect(screen.getByText('No trials yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new trial/i })).toBeInTheDocument();
  });

  it('does not expose map content when canManageShow is false', () => {
    render(
      <ShowMapTab show={show} trials={[trial]} classes={[]} entries={[]} canManageShow={false} />
    );

    expect(screen.queryByTestId('map-canvas')).not.toBeInTheDocument();
    expect(screen.getByText(/we couldn't load this map/i)).toBeInTheDocument();
  });
});
