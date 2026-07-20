import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';
import { applyManualClassStatus } from '@/services/show-day/classStatusMutations';

import { ClassStatusControl } from './ClassOperationalControls';

vi.mock('@/services/show-day/classStatusMutations', () => ({
  applyManualClassStatus: vi.fn(async () => undefined),
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

  it('keeps cancellation separate from routine lifecycle choices', async () => {
    const { user } = render(
      <ClassStatusControl classId="class-1" lifecycle="in-progress" canManageShow />
    );

    expect(screen.getByRole('separator')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Cancelled' })).toHaveClass('text-destructive');
  });
});
