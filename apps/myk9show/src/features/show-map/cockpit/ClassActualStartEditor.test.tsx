import { useState } from 'react';
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

  function Harness({
    classId = 'class-1',
    className = 'Vehicle Elite B',
    hasStart,
    startOpen = true,
  }: {
    classId?: string;
    className?: string;
    hasStart: boolean;
    startOpen?: boolean;
  }) {
    const [open, setOpen] = useState(startOpen);
    return (
      <ClassActualStartEditor
        classId={classId}
        className={className}
        trialDate="2026-10-10"
        timeZone="America/Chicago"
        hasStart={hasStart}
        open={open}
        onOpenChange={setOpen}
      />
    );
  }

  const field = () => screen.getByLabelText('Start time for Vehicle Elite B');

  it('renders nothing while closed', () => {
    render(<Harness hasStart startOpen={false} />);

    expect(screen.queryByLabelText('Start time for Vehicle Elite B')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('clears a recorded start from the open form and closes it', async () => {
    const { user } = render(<Harness hasStart />);

    await user.click(screen.getByRole('button', { name: 'Clear start time for Vehicle Elite B' }));

    expect(updateClass).toHaveBeenCalledWith('class-1', { actual_start_time: undefined });
    expect(screen.queryByLabelText('Start time for Vehicle Elite B')).not.toBeInTheDocument();
  });

  it('saves an edited start as the trial-local instant', async () => {
    const { user } = render(<Harness hasStart />);

    await user.type(field(), '9:42 AM');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(updateClass).toHaveBeenCalledWith('class-1', {
      actual_start_time: '2026-10-10T14:42:00.000Z',
    });
  });

  it('offers no Clear start when no start is recorded', () => {
    render(<Harness hasStart={false} />);

    expect(screen.queryByRole('button', { name: /Clear start/ })).not.toBeInTheDocument();
  });

  it('refuses an unreadable time without writing', async () => {
    const { user } = render(<Harness hasStart={false} />);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a time like 9:42 AM.');
    expect(updateClass).not.toHaveBeenCalled();
  });

  it('shows a retryable error after a rejected clear, then recovers on retry', async () => {
    updateClass.mockRejectedValueOnce(new Error('synthetic local storage failure'));
    const { user } = render(<Harness hasStart />);
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
    const { user } = render(<Harness hasStart />);

    await user.type(field(), '9:42 AM');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not save the start time. Try again.'
    );
    expect(field()).toBeInTheDocument();
  });

  it('does not carry a clear error or a draft onto a different class', async () => {
    updateClass.mockRejectedValueOnce(new Error('synthetic local storage failure'));
    const { user, rerender } = render(<Harness hasStart />);

    await user.click(screen.getByRole('button', { name: 'Clear start time for Vehicle Elite B' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    rerender(<Harness classId="class-2" className="Interior Elite A" hasStart />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Start time for Interior Elite A')).toHaveValue('');
  });
});
