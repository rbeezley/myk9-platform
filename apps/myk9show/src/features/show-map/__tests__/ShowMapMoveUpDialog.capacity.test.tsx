import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { ShowMapMoveUpDialog } from '../ShowMapMoveUpDialog';
import type { MoveUpCapacityState } from '../useMoveUpTargets';

const entryNode = {
  id: 'entry:e1',
  type: 'entry' as const,
  label: '#100 Acorn',
  entryDisplay: { armband: '100', dogName: 'Acorn' },
  childrenCount: 0,
};

function renderDialog(capacityState: MoveUpCapacityState) {
  return render(
    <ShowMapMoveUpDialog
      open
      node={entryNode}
      targets={[{ id: 'c2', label: 'Container Advanced' }]}
      capacityState={capacityState}
      isSubmitting={false}
      onOpenChange={vi.fn()}
      onConfirm={vi.fn()}
    />
  );
}

describe('ShowMapMoveUpDialog capacity state (MYK9-920)', () => {
  it('says it is checking capacity and keeps the confirm disabled while loading', () => {
    renderDialog('loading');
    expect(screen.getByText('Checking class capacity…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move entry' })).toBeDisabled();
  });

  it('explains the save still refuses a full class when capacity is unavailable', () => {
    renderDialog('unavailable');
    expect(
      screen.getByText('Capacity unavailable — the save will still refuse a full class.')
    ).toBeInTheDocument();
  });

  it('shows no capacity note once ready', () => {
    renderDialog('ready');
    expect(screen.queryByText('Checking class capacity…')).not.toBeInTheDocument();
  });
});
