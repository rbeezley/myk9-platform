/**
 * MYK9-1625: the picker offers the allowed counts and saves the chosen one through
 * the class replica (offline-first), then reports it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@/test/utils/testUtils';

const { updateClass } = vi.hoisted(() => ({ updateClass: vi.fn() }));
vi.mock('@/services/replication', () => ({ replicatedClassesTable: { updateClass } }));

import { AreaCountSelectionDialog } from './AreaCountSelectionDialog';

const classData = { id: 'c1', element: 'Interior', level: 'Master', class_name: 'Interior Master' };

function renderDialog() {
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(
    <AreaCountSelectionDialog
      isOpen
      onClose={onClose}
      classData={classData}
      areaCountRequirements={{ min: 2, max: 3, maxTotalSeconds: 0 }}
      onSave={onSave}
    />
  );
  return { onSave, onClose };
}

describe('AreaCountSelectionDialog (MYK9-1625)', () => {
  beforeEach(() => {
    updateClass.mockReset().mockResolvedValue('m1');
  });

  it('offers exactly the allowed counts', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: '2 Areas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3 Areas' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^1 Area/ })).not.toBeInTheDocument();
  });

  it('saves the chosen count through the class replica, then reports it', async () => {
    const { onSave } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: '3 Areas' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(3));
    expect(updateClass).toHaveBeenCalledWith('c1', { areaCount: 3 });
  });

  it('stays open with a message when the save fails', async () => {
    updateClass.mockRejectedValue(new Error('disk'));
    const { onSave } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: '2 Areas' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't save/i);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('can be dismissed without choosing', () => {
    const { onClose, onSave } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
