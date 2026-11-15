import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassEntry } from '@myk9/ringside';
import { render, screen } from '@/test/utils/testUtils';
import { EMPTY_UNSENT_WORK } from '@/services/replication/unsentWork';
import type { UnsentWorkState } from '@/hooks/useUnsentWork';
import type { DatedRingClass } from './orderRingClassesByDay';

const unsent = vi.hoisted(() => ({ state: null as UnsentWorkState | null }));
vi.mock('@/hooks/useUnsentWork', () => ({ useUnsentWorkState: () => unsent.state }));

import { RingDayDoneCard } from './RingDayDoneCard';

const done = (id: string): DatedRingClass => ({
  entry: {
    id,
    class_name: id,
    class_status: 'completed',
    entry_count: 3,
    completed_count: 3,
    dogs: [],
  } as unknown as ClassEntry,
  scanPriority: 1,
  trialTimeZone: 'America/New_York',
  dayBucket: 'today',
  isToday: true,
});

describe('RingDayDoneCard (MYK9-2013)', () => {
  beforeEach(() => {
    unsent.state = { work: EMPTY_UNSENT_WORK, status: 'known' };
  });

  it('reads all done and sent at the top of the list', () => {
    render(<RingDayDoneCard showId="show-1" yourRing={[done('a'), done('b')]} />);
    expect(screen.getByRole('status', { name: 'Your day' })).toHaveTextContent(
      'All 2 classes done. Every score is sent.'
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('links unsent scores to the Scores not sent list', () => {
    unsent.state = {
      work: { ...EMPTY_UNSENT_WORK, unsentScoreCount: 2, total: 2 },
      status: 'known',
    };
    render(<RingDayDoneCard showId="show-1" yourRing={[done('a')]} />);
    expect(screen.getByRole('status', { name: 'Your day' })).toHaveTextContent(
      '2 scores not sent. Keep this phone on and connected.'
    );
    expect(screen.getByRole('link', { name: 'Scores not sent' })).toHaveAttribute(
      'href',
      '/at-show/show-1/scores-not-sent'
    );
  });

  it('renders nothing while a class is still open', () => {
    const open = { ...done('a'), entry: { ...done('a').entry, class_status: 'in_progress' } };
    render(<RingDayDoneCard showId="show-1" yourRing={[open as DatedRingClass]} />);
    expect(screen.queryByTestId('ring-day-done')).not.toBeInTheDocument();
  });
});
