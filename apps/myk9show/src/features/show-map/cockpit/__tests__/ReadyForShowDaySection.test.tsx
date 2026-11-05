import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
const settings = vi.hoisted(() => ({ selfCheckinEnabled: true as boolean | undefined }));
vi.mock('@/hooks/queries/useShowSettingsDatabase', () => ({
  useShowSettings: () => ({ data: { selfCheckinEnabled: settings.selfCheckinEnabled } }),
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
      printTrackingInUse
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
    // Paperwork is built from the entries, so it can't pass while they are unread either.
    expect(screen.getAllByText("Can't check right now")).toHaveLength(2);
  });

  describe('own premium list (MYK9-1622)', () => {
    const ownPremiumShow = (usesLandingPage: boolean) =>
      fromAny<Show, unknown>({ ...show, publishesOwnPremium: true, usesLandingPage });

    beforeEach(() => {
      publishInfo.current = {
        fetchStatus: 'idle',
        isError: false,
        data: {
          publishedLocator: null,
          publishedPath: null,
          publishedAt: null,
          updatedAt: '2026-10-01T00:00:00Z',
          experienceIsPublished: false,
        },
      };
    });

    it('renders no premium line, only the landing page check, when the show uses one', () => {
      renderSection('2026-10-15T16:00:00Z', { show: ownPremiumShow(true) });
      expect(screen.getByText('Ready for show day')).toBeInTheDocument();
      expect(screen.queryByText('Premium published and current')).not.toBeInTheDocument();
      expect(screen.getByText('Landing page published')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Landing page not published/ })).toBeInTheDocument();
    });

    it('renders neither line, and is all clear, without a landing page', () => {
      renderSection('2026-10-19T16:00:00Z', { show: ownPremiumShow(false) });
      expect(screen.getByText('Everything is handled.')).toBeInTheDocument();
      expect(screen.queryByText('Premium published and current')).not.toBeInTheDocument();
      expect(screen.queryByText('Landing page published')).not.toBeInTheDocument();
    });

    it('still lists the premium line when myK9 publishes the premium', () => {
      renderSection('2026-10-15T16:00:00Z', {
        show: fromAny<Show, unknown>({ ...show, publishesOwnPremium: false }),
      });
      expect(screen.getByText('Premium published and current')).toBeInTheDocument();
    });
  });

  describe('suggestions (MYK9-1686)', () => {
    const NIGHT_BEFORE = '2026-10-19T16:00:00Z';
    const allOn = {
      usesDeviceScoring: true,
      usesPaperPacket: true,
      usesVolunteers: true,
      usesLandingPage: true,
    };
    const suggestionShow = (over: Partial<Show>) => fromAny<Show, unknown>({ ...show, ...over });

    beforeEach(() => {
      window.localStorage.clear();
      settings.selfCheckinEnabled = true;
    });

    it.each([
      ['selfCheckin', { ...allOn }, false, /check themselves in/],
      ['deviceScoring', { ...allOn, usesDeviceScoring: false }, true, /score on their phones/],
      ['paperPacket', { ...allOn, usesPaperPacket: false }, true, /printed backup packet/],
      ['volunteers', { ...allOn, usesVolunteers: false }, true, /volunteer helpers/],
      ['landingPage', { ...allOn, usesLandingPage: false }, true, /public landing page/],
    ])('suggests %s when only that switch is off', (_key, uses, checkin, text) => {
      settings.selfCheckinEnabled = checkin;
      renderSection(NIGHT_BEFORE, { show: suggestionShow(uses) });
      expect(screen.getByText(text)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Turn it on' })).toHaveAttribute(
        'href',
        expect.stringContaining('venue')
      );
    });

    it('suggests nothing when every switch is on, and nothing for own-premium', () => {
      renderSection(NIGHT_BEFORE, {
        show: suggestionShow({ ...allOn, publishesOwnPremium: false }),
      });
      expect(screen.queryByRole('button', { name: 'Dismiss suggestion' })).toBeNull();
    });

    it('shows one suggestion at a time, in order, and does not count toward "Everything is handled"', () => {
      renderSection(NIGHT_BEFORE, { show: suggestionShow({}) });
      expect(screen.getByText('Everything is handled.')).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Dismiss suggestion' })).toHaveLength(1);
      expect(screen.getByText(/printed backup packet/)).toBeInTheDocument();
    });

    it('dismisses, and stays gone after a re-render and a remount', async () => {
      const user = userEvent.setup();
      const { unmount } = renderSection(NIGHT_BEFORE, {
        show: suggestionShow({ ...allOn, usesPaperPacket: false }),
      });
      await user.click(screen.getByRole('button', { name: 'Dismiss suggestion' }));
      expect(screen.queryByText(/printed backup packet/)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Dismiss suggestion' })).toBeNull();
      unmount();
      renderSection(NIGHT_BEFORE, { show: suggestionShow({ ...allOn, usesPaperPacket: false }) });
      expect(screen.queryByText(/printed backup packet/)).toBeNull();
    });

    it('never nags when storage is unavailable', () => {
      const spy = vi.spyOn(window.localStorage, 'getItem').mockImplementation(key => {
        if (key.startsWith('myk9:show-uses-suggestion-dismissed')) throw new Error('blocked');
        return null;
      });
      try {
        renderSection(NIGHT_BEFORE, { show: suggestionShow({}) });
        expect(screen.queryByRole('button', { name: 'Dismiss suggestion' })).toBeNull();
      } finally {
        spy.mockRestore();
      }
    });
  });
});
