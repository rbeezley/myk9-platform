import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fromAny } from '@total-typescript/shoehorn';

import { render } from '@/test/utils/testUtils';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { Show } from '@/types/show-types';

import { ReadyForShowDaySection } from '../ReadyForShowDaySection';

const publishInfo = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const offline = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('@/features/premium/usePublishInfo', () => ({
  usePublishInfo: () => publishInfo.current,
}));
vi.mock('@/features/offline-readiness/useOfflineReadiness', () => ({
  useOfflineReadiness: () => ({ readiness: offline.current }),
}));

const show = fromAny<Show, unknown>({
  id: 'show-1',
  name: 'Fall Trial',
  organization: 'AKC',
  startDate: '2026-10-20',
  endDate: '2026-10-21',
  location: 'Louisville, KY',
  clubName: 'Calm Canine Club',
  status: 'published',
});
const trial = fromAny<SyncableTrial, unknown>({
  id: 't1',
  showId: 'show-1',
  trialDate: '2026-10-20',
});
const classes = [{ id: 'c1', trialId: 't1', name: 'Containers Novice', judgeName: 'Jane Smith' }];
const paperwork = {
  available: true,
  byClassId: new Map([
    [
      'c1',
      [
        { reportId: 'check-in-sheet', label: 'Check-in sheet', state: 'current' as const },
        { reportId: 'scoresheet', label: 'Score sheets', state: 'current' as const },
      ],
    ],
  ]),
};

function renderSection(
  now: string,
  overrides: Partial<Parameters<typeof ReadyForShowDaySection>[0]> = {}
) {
  return render(
    <ReadyForShowDaySection
      show={show}
      trials={[trial]}
      classes={classes}
      now={new Date(now)}
      entryBreakdownByClassId={new Map([['c1', { entered: 4, pending: 0 }]])}
      paperwork={paperwork}
      {...overrides}
    />
  );
}

describe('ReadyForShowDaySection', () => {
  beforeEach(() => {
    publishInfo.current = {
      fetchStatus: 'idle',
      isError: false,
      data: {
        publishedLocator: 'https://example.com/p.pdf',
        publishedPath: null,
        publishedAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
        experienceIsPublished: true,
      },
    };
    offline.current = { ready: true, missing: [], asOf: 1 };
  });

  it('collapses to one calm line when every check passes', () => {
    renderSection('2026-10-19T16:00:00Z');
    expect(screen.getByText('Everything is handled.')).toBeInTheDocument();
    expect(screen.queryByText('Ready for show day')).not.toBeInTheDocument();
  });

  it('renders nothing outside the window', () => {
    renderSection('2026-10-20T16:00:00Z');
    expect(screen.queryByText('Everything is handled.')).not.toBeInTheDocument();
    expect(screen.queryByText('Ready for show day')).not.toBeInTheDocument();
  });

  it('lists the checklist with a fix link for what is pending', () => {
    renderSection('2026-10-15T16:00:00Z', {
      entryBreakdownByClassId: new Map([['c1', { entered: 4, pending: 1 }]]),
    });
    expect(screen.getByText('Ready for show day')).toBeInTheDocument();
    expect(screen.queryByText('Everything is handled.')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /1 entry is waiting for review/ })).toBeInTheDocument();
  });

  it("says it can't check, never ready, when the publish read is paused offline", () => {
    publishInfo.current = { ...publishInfo.current, fetchStatus: 'paused' };
    renderSection('2026-10-19T16:00:00Z');
    expect(screen.queryByText('Everything is handled.')).not.toBeInTheDocument();
    expect(screen.getByText("Can't check right now")).toBeInTheDocument();
  });

  it('never claims ready while entries are unread', () => {
    renderSection('2026-10-19T16:00:00Z', { entryBreakdownByClassId: undefined });
    expect(screen.queryByText('Everything is handled.')).not.toBeInTheDocument();
  });
});
