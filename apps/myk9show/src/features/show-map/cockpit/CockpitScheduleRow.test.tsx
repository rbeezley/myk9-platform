import { screen, within } from '@testing-library/react';
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
  finishedLabel: null,
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
  cardStatus: {
    progress: { scored: 0, total: 5 },
    inRing: null,
    nextUp: [],
    nextStep: '3 of 5 not checked in',
  },
};

const running: ScheduledClassModel = {
  ...classItem,
  startedLabel: '9:42 AM',
  lifecycle: { evidence: 'recorded', value: 'in-progress' },
  cardStatus: {
    progress: { scored: 3, total: 5 },
    inRing: { armband: '106', dogName: 'Willow' },
    nextUp: ['#105', '#110'],
    nextStep: null,
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

const status = () => screen.getByTestId('class-status-line');

describe('CockpitScheduleRow pending link', () => {
  it('sets "N pending" before the next step, linked to the class review list', () => {
    renderRow(2);
    expect(status()).toHaveTextContent('2 pending · 3 of 5 not checked in');
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
    await user.click(status());
    expect(onFocusClass).toHaveBeenCalledWith('class-1');
  });

  it('shows no link when nothing is pending', () => {
    renderRow(0);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(status()).toHaveTextContent('3 of 5 not checked in');
    expect(status()).not.toHaveTextContent('pending');
  });

  it('shows the link alone when there is no next step', () => {
    renderRow(1, vi.fn(), {
      ...classItem,
      cardStatus: { ...classItem.cardStatus, nextStep: null },
    });
    expect(screen.getByRole('link', { name: '1 pending in Container Novice' })).toBeInTheDocument();
    expect(status()).not.toHaveTextContent('·');
  });
});

// MYK9-2143: the Ringside class card's layout.
describe('CockpitScheduleRow layout', () => {
  it('puts the class name first, then the judge and the time on the line under it', () => {
    renderRow(0);
    const name = screen.getByRole('button', { name: 'Container Novice' });
    const judge = screen.getByTestId('class-judge');
    const time = screen.getByTestId('class-time');
    expect(judge).toHaveTextContent(/^Judge to be announced$/);
    expect(time).toHaveTextContent(/^9:00 AM$/);
    expect(judge.parentElement).toContainElement(time);
    expect(judge.parentElement).not.toContainElement(name);
    expect(name.compareDocumentPosition(judge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(status()).not.toContainElement(judge);
  });

  it('wraps instead of truncating, so nothing collapses in the 300px rail', () => {
    renderRow(0);
    const judge = screen.getByTestId('class-judge');
    expect(judge.parentElement).toHaveClass('flex-wrap');
    expect(judge.closest('.truncate')).toBeNull();
    const name = screen.getByRole('button', { name: 'Container Novice' });
    expect(name.closest('.truncate')).toBeNull();
    expect(name).not.toHaveClass('truncate');
    expect(name.className).toContain('focus-visible:ring-2');
  });

  it('says a class with no planned time has none', () => {
    renderRow(0, vi.fn(), { ...classItem, expectedStart: null, timeLabel: 'Time not set' });
    expect(screen.getByTestId('class-time')).toHaveTextContent(/^No time$/);
  });

  it('labels the planned time once the class has started, beside the recorded start', () => {
    renderRow(0, vi.fn(), running);
    expect(screen.getByTestId('class-time')).toHaveTextContent(/^Expected 9:00 AM$/);
    expect(screen.getByTestId('class-ran')).toHaveTextContent(/^Started 9:42 AM$/);
  });

  it('adds the recorded finish, and says when a start was never recorded', () => {
    renderRow(0, vi.fn(), {
      ...running,
      lifecycle: { evidence: 'recorded', value: 'complete' },
      finishedLabel: '11:05 AM',
    });
    expect(screen.getByTestId('class-ran')).toHaveTextContent(
      /^Started 9:42 AM · Finished 11:05 AM$/
    );
  });

  it('says a running class has no recorded start or planned time, never a bare time', () => {
    renderRow(0, vi.fn(), {
      ...running,
      startedLabel: null,
      expectedStart: null,
      timeLabel: 'Time not set',
    });
    expect(screen.getByTestId('class-time')).toHaveTextContent(/^No expected time$/);
    expect(screen.getByTestId('class-ran')).toHaveTextContent(/^Start not recorded$/);
  });

  it('shows no start or finish line before the class starts', () => {
    renderRow(0);
    expect(screen.queryByTestId('class-ran')).toBeNull();
  });

  it('keeps a recorded start and finish on a class cancelled after it began', () => {
    renderRow(0, vi.fn(), {
      ...running,
      lifecycle: { evidence: 'recorded', value: 'cancelled' },
      finishedLabel: '10:10 AM',
    });
    expect(screen.getByTestId('class-time')).toHaveTextContent(/^Expected 9:00 AM$/);
    expect(screen.getByTestId('class-ran')).toHaveTextContent(
      /^Started 9:42 AM · Finished 10:10 AM$/
    );
    expect(screen.queryByRole('progressbar', { hidden: true })).toBeNull();
  });

  it('breaks the start and finish line between its parts, never inside a time', () => {
    renderRow(0, vi.fn(), { ...running, finishedLabel: '11:05 AM' });
    const parts = [...screen.getByTestId('class-ran').children];
    expect(parts.map(part => part.textContent)).toEqual(['Started 9:42 AM', '· Finished 11:05 AM']);
    parts.forEach(part => expect(part).toHaveClass('whitespace-nowrap'));
  });

  it('clips the progress bar to the room the card has left', () => {
    renderRow(0, vi.fn(), running);
    const bar = screen.getByRole('progressbar', { hidden: true });
    expect(bar.parentElement).toHaveClass('min-w-0', 'overflow-hidden');
  });

  it('states the attention count in words and as visible text', () => {
    renderRow(0, vi.fn(), { ...classItem, attentionCount: 3 });
    expect(screen.getByRole('img', { name: '3 need attention' })).toBeInTheDocument();
    expect(screen.getByText('3 issues')).toBeInTheDocument();
  });
});

describe('CockpitScheduleRow status footer (MYK9-2143)', () => {
  it('shows the status badge and the count, and no bar before the class starts', () => {
    renderRow(0);
    expect(within(status()).getByText('Not started')).toBeInTheDocument();
    expect(within(status()).getByText('0 / 5')).toBeInTheDocument();
    expect(status()).toHaveTextContent('0 of 5 scored');
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('adds the progress bar once the class is running', () => {
    renderRow(0, vi.fn(), running);
    expect(within(status()).getByText('In progress')).toBeInTheDocument();
    expect(within(status()).getByText('3 / 5')).toBeInTheDocument();
    // Hidden from screen readers: the count beside it already says "3 of 5 scored" once.
    expect(screen.queryByRole('progressbar')).toBeNull();
    const bar = screen.getByRole('progressbar', { hidden: true });
    expect(bar).toHaveAttribute('aria-valuenow', '3');
    expect(bar).toHaveAttribute('aria-valuemax', '5');
  });

  it('keeps the status badge whole and lets the bar give way in a narrow rail', () => {
    renderRow(0, vi.fn(), running);
    const badge = within(status()).getByText('In progress');
    expect(badge.parentElement).toHaveClass('shrink-0', 'whitespace-nowrap');
  });

  it('names the dog in the ring by armband and name, then the next armbands', () => {
    renderRow(0, vi.fn(), running);
    expect(status()).toHaveTextContent('Armband 106 Willow in the ring');
    expect(status()).toHaveTextContent('Next #105 · #110');
  });

  it('names a dog in the ring that has no armband by name alone', () => {
    renderRow(0, vi.fn(), {
      ...running,
      cardStatus: { ...running.cardStatus, inRing: { armband: null, dogName: 'Willow' } },
    });
    expect(status()).toHaveTextContent('Willow in the ring');
    expect(status()).not.toHaveTextContent('Armband');
  });

  it('lists a waiting dog with no armband by name, in its place in line', () => {
    renderRow(0, vi.fn(), {
      ...running,
      cardStatus: { ...running.cardStatus, nextUp: ['Scout', '#110'] },
    });
    expect(status()).toHaveTextContent('Next Scout · #110');
  });

  it('shows no ring line when nobody is in the ring or waiting', () => {
    renderRow(0);
    expect(status()).not.toHaveTextContent('Next');
    expect(status()).not.toHaveTextContent('in the ring');
  });

  it('leaves an unknown count out, never as a zero', () => {
    renderRow(0, vi.fn(), {
      ...classItem,
      cardStatus: { progress: null, inRing: null, nextUp: [], nextStep: null },
    });
    expect(within(status()).getByText('Not started')).toBeInTheDocument();
    expect(status()).not.toHaveTextContent('/');
    expect(status()).not.toHaveTextContent('scored');
  });

  it('shows the next after-scoring step on a complete class', () => {
    renderRow(0, vi.fn(), {
      ...classItem,
      lifecycle: { evidence: 'recorded', value: 'complete' },
      cardStatus: {
        progress: { scored: 5, total: 5 },
        inRing: null,
        nextUp: [],
        nextStep: 'Print preliminary results',
      },
    });
    expect(within(status()).getByText('Complete')).toBeInTheDocument();
    expect(status()).toHaveTextContent('Print preliminary results');
    expect(screen.getByRole('progressbar', { hidden: true })).toHaveAttribute('aria-valuenow', '5');
  });
});

describe('CockpitScheduleRow unset judge (MYK9-1846)', () => {
  it('reads Judge to be announced for a stored TBD, and and an empty name read the same', () => {
    renderRow(0, vi.fn(), { ...classItem, judgeName: 'TBD' });
    expect(screen.getByTestId('class-judge')).toHaveTextContent(/^Judge to be announced$/);
    expect(screen.queryByText('TBD')).not.toBeInTheDocument();
  });

  it('reads Judge to be announced for an empty name, never Judge not set', () => {
    renderRow(0, vi.fn(), { ...classItem, judgeName: '' });
    expect(screen.getByTestId('class-judge')).toHaveTextContent(/^Judge to be announced$/);
    expect(screen.queryByText('Judge not set')).not.toBeInTheDocument();
  });
});
