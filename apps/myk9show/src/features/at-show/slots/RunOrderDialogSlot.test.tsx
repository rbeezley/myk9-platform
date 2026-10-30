import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type { Entry } from '@myk9/ringside';
import { render } from '@/test/utils/testUtils';
import { RunOrderDialogSlot } from './RunOrderDialogSlot';

function entry(id: string, armband: number, section: 'A' | 'B' | null): Entry {
  return { id, armband, section, exhibitorOrder: armband } as unknown as Entry;
}

const combined = [entry('a1', 1, 'A'), entry('a2', 2, 'A'), entry('b1', 3, 'B')];
const single = [entry('e1', 1, null), entry('e2', 2, null)];

function setup(entries: Entry[]) {
  const onApplyOrder = vi.fn().mockResolvedValue(undefined);
  const onOpenDragMode = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <RunOrderDialogSlot
      isOpen
      onClose={onClose}
      entries={entries}
      onApplyOrder={onApplyOrder}
      onOpenDragMode={onOpenDragMode}
    />
  );
  return { ...view, onApplyOrder, onOpenDragMode, onClose };
}

describe('RunOrderDialogSlot (ringside run-order dialog)', () => {
  it('offers descending and random on a single-section class', async () => {
    const { user, onApplyOrder } = setup(single);
    await user.click(screen.getByText('Armband High to Low'));
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApplyOrder).toHaveBeenCalledWith('armband-desc', 'all', undefined);
    expect(screen.queryByText('Combined (ignore sections)')).not.toBeInTheDocument();
  });

  it('offers Combined and A/B ordering on a combined class', async () => {
    const { user, onApplyOrder } = setup(combined);
    await user.click(screen.getAllByText('Armband High to Low')[1]);
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApplyOrder).toHaveBeenCalledWith('a-then-b-desc', 'all', undefined);
  });

  it('passes section scope and renumber mode through to the handler', async () => {
    const { user, onApplyOrder } = setup(combined);
    await user.click(screen.getByRole('button', { name: 'Section B' }));
    await user.click(screen.getByText('Random Shuffle'));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByText(/Renumber all/i));
    expect(onApplyOrder).toHaveBeenCalledWith('random', 'B', 'renumber');
  });

  it('routes Manual Drag and Drop to drag mode without applying a preset', async () => {
    const { user, onApplyOrder, onOpenDragMode } = setup(single);
    await user.click(screen.getByText('Manual Drag and Drop'));
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onOpenDragMode).toHaveBeenCalledTimes(1);
    expect(onApplyOrder).not.toHaveBeenCalled();
  });

  it('stays open when the handler rejects', async () => {
    const { user, onApplyOrder, onClose } = setup(single);
    onApplyOrder.mockRejectedValueOnce(new Error('boom'));
    await user.click(screen.getByText('Random Shuffle'));
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onClose).not.toHaveBeenCalled();
    // Retry is possible: the selection survives and Apply is enabled again.
    expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
  });
});
