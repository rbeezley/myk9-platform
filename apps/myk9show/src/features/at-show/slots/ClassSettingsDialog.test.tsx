/**
 * MYK9-1626: Class Settings sets the class's planned start (its Expected start,
 * `revisedExpectedStart`) through the class replica, so it applies on this device
 * at once and queues offline. The secretary's schedule (`startTime`) is never written.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@/test/utils/testUtils';

const { updateClass, getClass, getTrial } = vi.hoisted(() => ({
  updateClass: vi.fn(),
  getClass: vi.fn(),
  getTrial: vi.fn(),
}));
vi.mock('@/services/replication', () => ({
  replicatedClassesTable: {
    updateClass,
    get: getClass,
    getClassById: getClass,
    subscribe: () => () => undefined,
  },
  replicatedTrialsTable: { get: getTrial },
}));

import { ClassSettingsDialog } from './ClassSettingsDialog';

const classData = {
  id: 'class-a',
  element: 'Interior',
  level: 'Novice',
  class_name: 'Interior Novice A',
};

function renderDialog() {
  const onClose = vi.fn();
  const onSettingsUpdate = vi.fn();
  render(
    <ClassSettingsDialog
      isOpen
      onClose={onClose}
      classData={classData}
      onSettingsUpdate={onSettingsUpdate}
    />
  );
  return { onClose, onSettingsUpdate };
}

describe('ClassSettingsDialog planned start (MYK9-1626)', () => {
  beforeEach(() => {
    updateClass.mockReset().mockResolvedValue('mutation-1');
    getTrial.mockReset().mockResolvedValue({ id: 't1', date: '2026-11-07' });
    getClass.mockReset().mockResolvedValue({
      id: 'class-a',
      trialId: 't1',
      startTime: '09:00',
    });
  });

  it('saves the typed time as an instant on the trial date, in the trial time zone', async () => {
    const { onClose, onSettingsUpdate } = renderDialog();
    const input = await screen.findByLabelText('Planned start time');
    fireEvent.change(input, { target: { value: '130' } });
    expect(screen.getByTestId('clock-time-preview')).toHaveTextContent('= 1:30 PM');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    // 13:30 Eastern on 2026-11-07 (EST, UTC-5).
    expect(updateClass).toHaveBeenCalledTimes(1);
    expect(updateClass).toHaveBeenCalledWith('class-a', {
      revisedExpectedStart: '2026-11-07T18:30:00.000Z',
    });
    expect(onSettingsUpdate).toHaveBeenCalled();
  });

  it('starts from the class expected start and clears it when emptied', async () => {
    getClass.mockResolvedValue({
      id: 'class-a',
      trialId: 't1',
      startTime: '09:00',
      revisedExpectedStart: '2026-11-07T15:00:00.000Z',
    });
    renderDialog();
    const input = await screen.findByLabelText('Planned start time');
    await waitFor(() => expect(input).toHaveValue('10:00 AM'));
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(updateClass).toHaveBeenCalledWith('class-a', { revisedExpectedStart: null })
    );
  });

  it('will not save a time that is still AM or PM undecided', async () => {
    renderDialog();
    const input = await screen.findByLabelText('Planned start time');
    fireEvent.change(input, { target: { value: '7:00' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(updateClass).not.toHaveBeenCalled();
  });

  it('shows an error and stays open when the device write fails', async () => {
    updateClass.mockRejectedValue(new Error('boom'));
    const { onClose } = renderDialog();
    const input = await screen.findByLabelText('Planned start time');
    fireEvent.change(input, { target: { value: '1330' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Try again/);
    expect(onClose).not.toHaveBeenCalled();
  });
});
