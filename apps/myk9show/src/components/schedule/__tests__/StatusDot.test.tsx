import { describe, it, expect } from 'vitest';
import { CLASS_STATUS } from '@myk9/core';
import type { ClassStatusValue } from '@myk9/core';
import { render } from '@/test/utils/testUtils';
import { StatusDot } from '../StatusDot';

const ALL_STATUSES: ClassStatusValue[] = [
  CLASS_STATUS.SCHEDULED,
  CLASS_STATUS.UPCOMING,
  CLASS_STATUS.IN_PROGRESS,
  CLASS_STATUS.COMPLETED,
  CLASS_STATUS.CANCELLED,
];

describe('StatusDot', () => {
  it('routes every status through the shared class icon grammar', () => {
    for (const status of ALL_STATUSES) {
      const { container, unmount } = render(<StatusDot status={status} />);
      const icon = container.querySelector('[data-family="class"]');
      expect(icon).toHaveAttribute('data-status', status);
      unmount();
    }
  });

  it('uses distinct shared shapes and semantic colors for lifecycle states', () => {
    const scheduled = render(<StatusDot status={CLASS_STATUS.SCHEDULED} />);
    expect(scheduled.container.querySelector('[data-family="class"]')).toHaveAttribute(
      'data-shape',
      'not-started'
    );
    scheduled.unmount();

    const inProgress = render(<StatusDot status={CLASS_STATUS.IN_PROGRESS} />);
    const inProgressIcon = inProgress.container.querySelector('[data-family="class"]');
    expect(inProgressIcon).toHaveAttribute('data-shape', 'in-progress');
    expect(inProgressIcon).toHaveClass('text-info');
    inProgress.unmount();

    const completed = render(<StatusDot status={CLASS_STATUS.COMPLETED} />);
    const completedIcon = completed.container.querySelector('[data-family="class"]');
    expect(completedIcon).toHaveAttribute('data-shape', 'complete');
    expect(completedIcon).toHaveClass('text-success');
  });

  it('exposes the shared class status label accessibly', () => {
    const { getByRole } = render(<StatusDot status={CLASS_STATUS.IN_PROGRESS} />);

    expect(getByRole('img', { name: 'In Progress' })).toBeInTheDocument();
  });
});
