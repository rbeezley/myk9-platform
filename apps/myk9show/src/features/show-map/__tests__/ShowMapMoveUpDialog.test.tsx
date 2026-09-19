import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { ShowMapMoveUpDialog } from '../ShowMapMoveUpDialog';
import type { MoveUpReversalState } from '../moveUpSupersession';
import type { ShowMapNode } from '../showMapTypes';

const entryNode = {
  id: 'entry:dest-1',
  type: 'entry',
  label: '#100 Acorn',
  entryDisplay: { armband: '100', dogName: 'Acorn' },
  childrenCount: 0,
} satisfies ShowMapNode;

const AVAILABLE: MoveUpReversalState = {
  kind: 'available',
  destinationEntryId: 'dest-1',
  sourceEntryId: 'source-1',
  sourceClassId: 'class-novice',
  sourceClassName: 'Interior Novice A',
};

function renderDialog(overrides: Partial<Parameters<typeof ShowMapMoveUpDialog>[0]> = {}) {
  const onMoveBack = vi.fn();
  const props = {
    open: true,
    node: entryNode,
    targets: [],
    isSubmitting: false,
    onOpenChange: vi.fn(),
    onConfirm: vi.fn(),
    onMoveBack,
    ...overrides,
  };
  return { ...render(<ShowMapMoveUpDialog {...props} />), onMoveBack };
}

describe('ShowMapMoveUpDialog move-back (MYK9-640)', () => {
  it('offers the way back, naming the class the entry was moved out of', async () => {
    const { onMoveBack } = renderDialog({ reversal: AVAILABLE });

    const button = screen.getByRole('button', { name: /move back to Interior Novice A/i });
    await userEvent.click(button);

    expect(onMoveBack).toHaveBeenCalledTimes(1);
  });

  it('stops calling a top-level move-up a dead end when a way back exists', () => {
    renderDialog({ reversal: AVAILABLE });

    expect(screen.queryByText('No other classes are available.')).not.toBeInTheDocument();
    expect(screen.getByText(/no higher class to move up to/i)).toBeInTheDocument();
  });

  it('says WHY there is no way back once the run has started, and offers no control', () => {
    renderDialog({ reversal: { kind: 'blocked', reason: 'run-started' } });

    expect(screen.getByText(/run has already started/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /move back/i })).not.toBeInTheDocument();
  });

  it('says WHY when the original entry is gone', () => {
    renderDialog({ reversal: { kind: 'blocked', reason: 'source-missing' } });

    expect(screen.getByText(/no longer has the original entry/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /move back/i })).not.toBeInTheDocument();
  });

  it('explains when this move-up was superseded by a later move', () => {
    renderDialog({ reversal: { kind: 'blocked', reason: 'superseded' } });

    expect(screen.getByText(/since been superseded by another move-up/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /move back/i })).not.toBeInTheDocument();
  });

  it('says nothing at all about moving back on an entry that was never moved', () => {
    renderDialog({ reversal: { kind: 'blocked', reason: 'not-a-move-up' } });

    expect(screen.queryByText(/move back/i)).not.toBeInTheDocument();
    expect(screen.getByText('No other classes are available.')).toBeInTheDocument();
  });

  it('disables the control while the reversal is in flight', () => {
    renderDialog({ reversal: AVAILABLE, isReversing: true });

    expect(screen.getByRole('button', { name: /moving back/i })).toBeDisabled();
  });
});
