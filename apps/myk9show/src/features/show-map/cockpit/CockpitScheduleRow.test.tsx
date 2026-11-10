import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { getClassReviewHref } from '@/features/entry-operations/entryAttentionRoutes';
import { render } from '@/test/utils/testUtils';

import { CockpitScheduleRow } from './CockpitScheduleRow';
import type { ScheduledClassModel } from './secretaryCockpitTypes';

const classItem: ScheduledClassModel = {
  id: 'class-1',
  trialId: 'trial-1',
  name: 'Container Novice',
  timeLabel: '9:00 AM',
  scheduledStart: '9:00 AM',
  expectedStart: '9:00 AM',
  startedLabel: null,
  lifecycle: { evidence: 'recorded', value: 'not-started' },
  progress: { evidence: 'computed', value: { completed: 0, total: 8 } },
  judgeName: null,
  filterFacts: {
    lifecycle: 'not-started',
    closeout: 'none',
    judge: { value: '~unassigned', label: 'Unassigned' },
    element: null,
    level: null,
  },
  attentionCount: 0,
  closeout: 'none',
  primaryAction: null,
  statusLine: {
    text: 'Not started · 3 not checked in',
    parts: ['Not started', '3 not checked in'],
  },
};

function renderRow(
  pendingCount: number,
  onFocusClass = vi.fn(),
  item: ScheduledClassModel = classItem
) {
  render(
    <CockpitScheduleRow
      classItem={item}
      showId="show-1"
      pendingCount={pendingCount}
      focused={false}
      select={undefined}
      onFocusClass={onFocusClass}
    />
  );
  return onFocusClass;
}

describe('CockpitScheduleRow pending link', () => {
  it('sets "N pending" in the status phrase, linked to the class review list', () => {
    renderRow(2);
    expect(screen.getByTestId('class-status-line')).toHaveTextContent(
      'Not started · 2 pending · 3 not checked in'
    );
    const link = screen.getByRole('link', { name: '2 pending in Container Novice' });
    expect(link).toHaveAttribute(
      'href',
      getClassReviewHref({ showId: 'show-1', trialId: 'trial-1', classId: 'class-1' })
    );
  });

  it('does not select the class when the link is clicked, but does for the card', async () => {
    const user = userEvent.setup();
    const onFocusClass = renderRow(2);
    const link = screen.getByRole('link', { name: '2 pending in Container Novice' });
    link.addEventListener('click', event => event.preventDefault());
    await user.click(link);
    expect(onFocusClass).not.toHaveBeenCalled();
    await user.click(screen.getByTestId('class-status-line'));
    expect(onFocusClass).toHaveBeenCalledWith('class-1');
  });

  it('shows no link when nothing is pending', () => {
    renderRow(0);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByTestId('class-status-line')).toHaveTextContent(
      'Not started · 3 not checked in'
    );
  });

  it('keeps the judge off the class-name line, so neither is squeezed in the narrow rail', () => {
    renderRow(0);
    const judge = screen.getByTestId('class-judge');
    const className = screen.getByRole('button', { name: 'Container Novice' });
    expect(judge).toHaveTextContent('Judge not set');
    // A flex-1 truncating judge beside the class name collapsed to a few pixels at 300px.
    expect(judge.parentElement).not.toBe(className.parentElement);
    expect(judge.closest('.truncate')).toBeNull();
    expect(judge.parentElement).toContainElement(screen.getByTestId('class-status-line'));
  });

  it('marks a recorded start as started, so it is not read as the planned time', () => {
    renderRow(0, vi.fn(), { ...classItem, startedLabel: '9:42 AM' });
    expect(screen.getByText('Started')).toBeInTheDocument();
    expect(screen.getByText(/9:42 AM/)).toBeInTheDocument();
  });

  it('lets the class name wrap and gives its button a visible focus ring', () => {
    renderRow(0);
    const name = screen.getByRole('button', { name: 'Container Novice' });
    expect(name.closest('.truncate')).toBeNull();
    expect(name).not.toHaveClass('truncate');
    expect(name.className).toContain('focus-visible:ring-2');
  });

  it('states the attention count in words and as visible text', () => {
    renderRow(0, vi.fn(), { ...classItem, attentionCount: 3 });
    expect(screen.getByRole('img', { name: '3 need attention' })).toBeInTheDocument();
    expect(screen.getByText('3 issues')).toBeInTheDocument();
  });
});
