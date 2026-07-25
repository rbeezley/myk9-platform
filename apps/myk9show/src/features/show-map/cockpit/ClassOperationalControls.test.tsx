import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { render } from '@/test/utils/testUtils';
import { applyManualClassStatus } from '@/services/show-day/classStatusMutations';
import { setRevisedExpectedStart } from '@/services/show-day/classTimingMutations';

import { ClassStatusControl, ExpectedStartControl } from './ClassOperationalControls';

vi.mock('@/services/show-day/classStatusMutations', () => ({
  applyManualClassStatus: vi.fn(async () => undefined),
}));
vi.mock('@/services/show-day/classTimingMutations', () => ({
  setRevisedExpectedStart: vi.fn(async () => undefined),
}));
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: (props: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" role="menuitem" {...props} />
  ),
  DropdownMenuSeparator: () => <hr role="separator" />,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('ClassStatusControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
  });

  it('requires confirmation before completing a Class with unentered scores', async () => {
    const { user } = render(
      <ClassStatusControl
        classId="class-1"
        lifecycle="in-progress"
        unenteredScoreCount={2}
        canManageShow
      />
    );

    await user.click(screen.getByRole('menuitem', { name: 'Complete' }));

    expect(window.confirm).toHaveBeenCalledWith(
      '2 paper scores still need entry. Mark this Class complete anyway?'
    );
    expect(applyManualClassStatus).not.toHaveBeenCalled();
  });

  it('keeps cancellation separate from routine lifecycle choices', () => {
    render(<ClassStatusControl classId="class-1" lifecycle="in-progress" canManageShow />);

    expect(screen.getByRole('separator')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Cancelled' })).toHaveClass('text-destructive');
  });

  it('keeps the current lifecycle visible but not actionable', () => {
    render(<ClassStatusControl classId="class-1" lifecycle="in-progress" canManageShow />);

    expect(screen.getByRole('menuitem', { name: 'In progress' })).toBeDisabled();
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
      />
    );

    await user.click(screen.getByRole('button', { name: /Set expected start|^\d/ }));
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
      />
    );

    await user.click(screen.getByRole('button', { name: /Set expected start|^\d/ }));
    await user.click(screen.getByRole('button', { name: 'Use scheduled time' }));

    expect(toast.error).toHaveBeenCalledWith('Could not revert to the scheduled time.');
  });
});
