import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const OPEN_TARGETS = [{ id: 'c2', label: 'Container Advanced' }];

function dialog(
  capacityState: MoveUpCapacityState,
  targets: Array<{ id: string; label: string; isFull?: boolean }> = OPEN_TARGETS,
  capacityIsStale = false
) {
  return (
    <ShowMapMoveUpDialog
      open
      node={entryNode}
      targets={targets}
      capacityState={capacityState}
      capacityIsStale={capacityIsStale}
      isSubmitting={false}
      onOpenChange={vi.fn()}
      onConfirm={vi.fn()}
    />
  );
}

function renderDialog(capacityState: MoveUpCapacityState) {
  return render(dialog(capacityState));
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

  it('says capacity may be out of date when stale data is shown after a failed refresh', () => {
    render(dialog('unavailable', OPEN_TARGETS, true));
    expect(
      screen.getByText('Capacity may be out of date — the save will still refuse a full class.')
    ).toBeInTheDocument();
  });

  it('lists a full class labelled Full and not selectable', async () => {
    render(
      dialog('ready', [
        { id: 'c2', label: 'Container Advanced' },
        { id: 'c3', label: 'Container Master', isFull: true },
      ])
    );
    await userEvent.click(screen.getByRole('combobox'));
    expect(screen.getByText('Full')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Container Master/ })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('disables Move when the selected class fills while the dialog is open', async () => {
    const view = render(dialog('ready'));
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(screen.getByRole('option', { name: /Container Advanced/ }));
    expect(screen.getByRole('button', { name: 'Move entry' })).toBeEnabled();

    view.rerender(dialog('ready', [{ id: 'c2', label: 'Container Advanced', isFull: true }]));
    expect(screen.getByRole('button', { name: 'Move entry' })).toBeDisabled();
  });
});
