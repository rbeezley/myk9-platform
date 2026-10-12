import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';
import { replicatedClassesTable } from '@/services/replication';

import { clockOnDateToIso } from '@/components/trials/trialDateTime';

import { ClassActualStartEditor } from './ClassActualStartEditor';

vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { updateClass: vi.fn(async () => 'mutation-1') },
}));

const updateClass = vi.mocked(replicatedClassesTable.updateClass);

describe('clockOnDateToIso', () => {
  it('reads the typed clock in the trial time zone on the trial date', () => {
    // 9:42 AM in Chicago on Oct 10 (CDT, UTC-5) is 14:42Z.
    expect(clockOnDateToIso('2026-10-10', '9:42 AM', 'America/Chicago')).toBe(
      '2026-10-10T14:42:00.000Z'
    );
  });

  it('returns null for a time or date it cannot read', () => {
    expect(clockOnDateToIso('2026-10-10', 'soon', 'America/Chicago')).toBeNull();
    expect(clockOnDateToIso('10/10/2026', '9:42 AM', 'America/Chicago')).toBeNull();
  });
});

describe('ClassActualStartEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderEditor = (hasStart: boolean) =>
    render(
      <ClassActualStartEditor
        classId="class-1"
        className="Vehicle Elite B"
        trialDate="2026-10-10"
        timeZone="America/Chicago"
        hasStart={hasStart}
      />
    );

  it('clears a recorded start through the replicated classes table', async () => {
    const { user } = renderEditor(true);

    await user.click(screen.getByRole('button', { name: 'Clear start time for Vehicle Elite B' }));

    expect(updateClass).toHaveBeenCalledWith('class-1', { actual_start_time: undefined });
  });

  it('saves an edited start as the trial-local instant', async () => {
    const { user } = renderEditor(true);

    await user.click(screen.getByRole('button', { name: 'Edit start time for Vehicle Elite B' }));
    await user.type(screen.getByLabelText('Start time for Vehicle Elite B'), '9:42 AM');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(updateClass).toHaveBeenCalledWith('class-1', {
      actual_start_time: '2026-10-10T14:42:00.000Z',
    });
  });

  it('refuses an unreadable time without writing', async () => {
    const { user } = renderEditor(false);

    expect(screen.queryByRole('button', { name: /Clear start/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Set start time for Vehicle Elite B' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a time like 9:42 AM.');
    expect(updateClass).not.toHaveBeenCalled();
  });
  it('shows a retryable error after a rejected clear, then recovers on retry', async () => {
    updateClass.mockRejectedValueOnce(new Error('synthetic local storage failure'));
    const { user } = renderEditor(true);
    const clear = () =>
      screen.getByRole('button', { name: 'Clear start time for Vehicle Elite B' });

    await user.click(clear());

    expect(updateClass).toHaveBeenCalledWith('class-1', { actual_start_time: undefined });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not save the start time. Try again.'
    );
    expect(clear()).toBeEnabled();

    await user.click(clear());

    expect(updateClass).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the form open with feedback when saving an edit is rejected', async () => {
    updateClass.mockRejectedValueOnce(new Error('synthetic local storage failure'));
    const { user } = renderEditor(true);

    await user.click(screen.getByRole('button', { name: 'Edit start time for Vehicle Elite B' }));
    await user.type(screen.getByLabelText('Start time for Vehicle Elite B'), '9:42 AM');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not save the start time. Try again.'
    );
    expect(screen.getByLabelText('Start time for Vehicle Elite B')).toBeInTheDocument();
  });

  it('does not carry a clear error or a draft onto a different class', async () => {
    updateClass.mockRejectedValueOnce(new Error('synthetic local storage failure'));
    const editorFor = (classId: string, className: string) => (
      <ClassActualStartEditor
        classId={classId}
        className={className}
        trialDate="2026-10-10"
        timeZone="America/Chicago"
        hasStart
      />
    );
    const { user, rerender } = render(editorFor('class-1', 'Vehicle Elite B'));

    await user.click(screen.getByRole('button', { name: 'Clear start time for Vehicle Elite B' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    rerender(editorFor('class-2', 'Interior Elite A'));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Edit start time for Interior Elite A' })
    ).toBeEnabled();
  });

  it('cannot start an edit while a clear is still saving', async () => {
    let finish: () => void = () => {};
    updateClass.mockImplementationOnce(
      () => new Promise<string>(resolve => (finish = () => resolve('mutation-1')))
    );
    const { user } = renderEditor(true);

    await user.click(screen.getByRole('button', { name: 'Clear start time for Vehicle Elite B' }));

    expect(
      screen.getByRole('button', { name: 'Edit start time for Vehicle Elite B' })
    ).toBeDisabled();
    finish();
    expect(
      await screen.findByRole('button', { name: 'Edit start time for Vehicle Elite B' })
    ).toBeEnabled();
  });

  it('drops a stale clear error when an edit is started', async () => {
    updateClass.mockRejectedValueOnce(new Error('synthetic local storage failure'));
    const { user } = renderEditor(true);

    await user.click(screen.getByRole('button', { name: 'Clear start time for Vehicle Elite B' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit start time for Vehicle Elite B' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
