import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { buildShowMapTree, getDefaultExpandedNodeIds } from '../showMapTree';
import { ShowMapStructureTable } from '../ShowMapStructureTable';
import type { Show } from '@/types/show-types';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { ShowMapClassInput } from '../showMapTypes';

const show = {
  id: 'show-1',
  name: 'Spring Trial',
  clubName: 'Calm Canine Club',
  organization: 'AKC',
} as Show;

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

const classes: ShowMapClassInput[] = [
  {
    id: 'class-attention',
    trialId: 'trial-1',
    name: 'Interior Novice A',
    status: 'In Progress',
  },
  {
    id: 'class-complete',
    trialId: 'trial-1',
    name: 'Exterior Advanced B',
    status: 'Complete',
  },
];

describe('ShowMapStructureTable', () => {
  it('keeps parent context when filtering to entries that need attention', () => {
    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes,
      entries: [
        {
          id: 'entry-attention',
          class_id: 'class-attention',
          armband: '12',
          handler: 'Jane Handler',
          dog: {
            call_name: 'Bella',
            breed: 'Mixed Breed',
            registrations: [{ organization: 'AKC', breed: 'Labrador Retriever' }],
          },
          check_in_status: 'conflict',
        },
        {
          id: 'entry-complete',
          class_id: 'class-complete',
          armband: '14',
          dog: { call_name: 'Scout' },
          is_scored: true,
        },
      ],
    });

    render(
      <ShowMapStructureTable
        tree={tree}
        expandedNodeIds={new Set(Object.keys(tree.nodesById))}
        filter="needs-attention"
        onToggle={vi.fn()}
      />
    );

    expect(screen.getByText('Trial 1')).toBeInTheDocument();
    expect(screen.getByText('Interior Novice A')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Bella')).toBeInTheDocument();
    expect(screen.getByText('Labrador Retriever')).toBeInTheDocument();
    expect(screen.getByText('Jane Handler')).toBeInTheDocument();
    expect(screen.queryByText('Exterior Advanced B')).not.toBeInTheDocument();
    expect(screen.queryByText('Scout')).not.toBeInTheDocument();
  });

  it('collapses class rows while keeping class-level scoring available', async () => {
    const attentionClass = classes[0];
    if (!attentionClass) throw new Error('Expected an attention class fixture');

    const tree = buildShowMapTree({
      show,
      trials: [trial],
      classes: [attentionClass],
      entries: [
        {
          id: 'entry-1',
          class_id: 'class-attention',
          armband: '12',
          dog: { call_name: 'Bella' },
        },
      ],
    });
    const expandedNodeIds = getDefaultExpandedNodeIds(tree);
    const onToggle = vi.fn();
    const onNavigate = vi.fn();

    const { user } = render(
      <ShowMapStructureTable
        tree={tree}
        expandedNodeIds={expandedNodeIds}
        filter="all"
        onToggle={onToggle}
        onNavigate={onNavigate}
      />
    );

    expect(screen.queryByText('Bella')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /open/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /score class/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /score class/i }));
    expect(onNavigate).toHaveBeenCalledWith('/scoring/classes/class-attention/entries?mode=split');

    await user.click(screen.getByRole('button', { name: /expand interior novice a/i }));

    expect(onToggle).toHaveBeenCalledWith('class:class-attention');
  });
});
