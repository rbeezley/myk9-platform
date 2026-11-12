import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { render } from '@/test/utils/testUtils';
import { setRevisedExpectedStart } from '@/services/show-day/classTimingMutations';

import { ClassStatusBadge, ExpectedStartControl } from './ClassOperationalControls';

vi.mock('@/services/show-day/classTimingMutations', () => ({
  setRevisedExpectedStart: vi.fn(async () => undefined),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('ClassStatusBadge', () => {
  it('reads as a plain status badge with no menu or button', () => {
    render(<ClassStatusBadge lifecycle="in-progress" />);

    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('says so when the status is unknown', () => {
    render(<ClassStatusBadge lifecycle={null} />);

    expect(screen.getByText('Status unknown')).toBeInTheDocument();
  });
});

describe('ExpectedStartControl revert to scheduled time', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears the revised start and confirms with a toast', async () => {
    const { user } = render(
      <ExpectedStartControl
        classId="class-1"
        scheduledStart="10:00 AM"
        revisedExpectedStart="2026-08-01T15:30:00.000Z"
        trialDate="2026-08-01"
        timeZone="America/Chicago"
        canManageShow
        editing
        onEditingChange={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Use scheduled time' }));

    expect(setRevisedExpectedStart).toHaveBeenCalledWith('class-1', null);
    expect(toast.success).toHaveBeenCalledWith('Reverted to the scheduled time.');
  });

  it('reports an error toast when the revert fails', async () => {
    vi.mocked(setRevisedExpectedStart).mockRejectedValueOnce(new Error('offline'));

    const { user } = render(
      <ExpectedStartControl
        classId="class-1"
        scheduledStart="10:00 AM"
        revisedExpectedStart="2026-08-01T15:30:00.000Z"
        trialDate="2026-08-01"
        timeZone="America/Chicago"
        canManageShow
        editing
        onEditingChange={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Use scheduled time' }));

    expect(toast.error).toHaveBeenCalledWith('Could not revert to the scheduled time.');
  });
});

describe('ExpectedStartControl read-only', () => {
  const base = {
    classId: 'class-1',
    scheduledStart: null,
    revisedExpectedStart: null,
    trialDate: '2026-08-01',
    timeZone: 'America/Chicago',
    canManageShow: false,
  };

  it('reads as the fact "Not set" with no button when no time is set', () => {
    render(<ExpectedStartControl {...base} />);

    expect(screen.getByText('Not set')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('Set expected start')).toBeNull();
  });

  it('still shows a set time', () => {
    render(<ExpectedStartControl {...base} scheduledStart="10:00 AM" />);

    expect(screen.getByText(/^10:00/)).toBeInTheDocument();
    expect(screen.queryByText('Not set')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
