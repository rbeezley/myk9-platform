/**
 * MYK9-1978: the exhibitor's "Change class" sheet. The values that matter are
 * the ones sent to the server (entry, class, reason) and the sentences a refusal
 * turns into, so the request call is asserted with its exact arguments.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { ChangeClassSheet } from './ChangeClassSheet';

const mocks = vi.hoisted(() => ({
  requestClassChange: vi.fn(),
  isOnline: vi.fn(),
  classes: [] as unknown[],
}));

vi.mock('@/services/database/entries/classChangeRequests', async importActual => ({
  ...(await importActual<typeof import('@/services/database/entries/classChangeRequests')>()),
  requestClassChange: mocks.requestClassChange,
}));
vi.mock('@/hooks/guestServerRead', () => ({ useQueryOnlineStatus: () => mocks.isOnline() }));
vi.mock('@/hooks/useClassAvailability', () => ({
  useClassAvailability: () => ({ classes: mocks.classes, isLoading: false, error: null }),
}));

function availability(overrides: Record<string, unknown>) {
  return {
    classId: 'x',
    className: 'X',
    element: 'Container',
    level: 'Novice',
    section: null,
    status: 'upcoming',
    hasStarted: false,
    trialId: 't1',
    trialName: 'Trial 2',
    isFull: false,
    ...overrides,
  };
}

const onSent = vi.fn();
const onOpenChange = vi.fn();

function renderSheet() {
  render(
    <ChangeClassSheet
      open
      onOpenChange={onOpenChange}
      entryId="entry-scout-novice"
      showId="show-1"
      dogName="Scout"
      className="Container Novice A"
      currentClassId="class-novice-a"
      dogClassIds={new Set(['class-novice-a', 'class-interior'])}
      onSent={onSent}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isOnline.mockReturnValue(true);
  mocks.requestClassChange.mockResolvedValue({ error: null });
  mocks.classes = [
    availability({ classId: 'class-novice-a', className: 'Container Novice A' }),
    availability({ classId: 'class-interior', className: 'Interior Novice A' }),
    availability({ classId: 'class-adv', className: 'Container Advanced' }),
    availability({ classId: 'class-full', className: 'Container Excellent', isFull: true }),
    availability({ classId: 'class-started', className: 'Container Master', hasStarted: true }),
  ];
});

const LATE_WARNING =
  'This is less than 30 minutes before the trial starts. The club may not be able to accept it.';

describe('ChangeClassSheet', () => {
  it('lists only classes the request could land in, and a full class cannot be picked', () => {
    renderSheet();
    expect(screen.getByText(/Container Advanced/)).toBeInTheDocument();
    expect(screen.getByText(/Container Excellent/)).toBeInTheDocument();
    expect(screen.getByText('Full')).toBeInTheDocument();
    // The dog's own class, a class it is already in, and a started class are not offered.
    expect(screen.queryByText(/Container Novice A\b.*Trial/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Interior Novice A/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Container Master/)).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Container Excellent/ })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('offers the three reasons in plain words', () => {
    renderSheet();
    expect(screen.getByText('Finished this level')).toBeInTheDocument();
    expect(screen.getByText('Entered the wrong level')).toBeInTheDocument();
    expect(screen.getByText('Wrong section')).toBeInTheDocument();
  });

  it('sends the chosen entry, class and reason, and nothing else', async () => {
    const user = userEvent.setup();
    renderSheet();
    const send = screen.getByRole('button', { name: 'Send request' });
    expect(send).toBeDisabled();

    await user.click(screen.getByRole('radio', { name: /Container Advanced/ }));
    await user.click(screen.getByRole('radio', { name: 'Finished this level' }));
    await user.click(send);

    await waitFor(() =>
      expect(mocks.requestClassChange).toHaveBeenCalledWith({
        entryId: 'entry-scout-novice',
        targetClassId: 'class-adv',
        reason: 'finished_level',
      })
    );
    await waitFor(() => expect(onSent).toHaveBeenCalled());
  });

  it.each([
    ['class_full', 'That class is full, so it cannot take another dog.'],
    ['class_started', 'That class has already started, so it cannot take a changed entry.'],
    [
      'class_changes_not_allowed',
      'This show does not take class change requests after entries close. Ask the secretary.',
    ],
    [
      'same_day_move_ups_not_allowed',
      'This show does not take requests to move to another trial on the same day. Ask the secretary.',
    ],
    [
      'request_already_open',
      'This entry already has a class change request. Take it back before asking again.',
    ],
    ['entry_not_accepted', 'This entry has to be accepted by the club before it can change class.'],
    [
      'entry_started',
      'This dog has already started at the show, so its class cannot be changed here.',
    ],
  ])('says %s in a plain sentence and keeps the sheet open', async (hint, sentence) => {
    mocks.requestClassChange.mockResolvedValue({
      error: { code: '22023', hint, message: 'Entry 22eb47a9 raw postgres text' },
    });
    const user = userEvent.setup();
    renderSheet();
    await user.click(screen.getByRole('radio', { name: /Container Advanced/ }));
    await user.click(screen.getByRole('radio', { name: 'Wrong section' }));
    await user.click(screen.getByRole('button', { name: 'Send request' }));

    expect(await screen.findByText(sentence)).toBeInTheDocument();
    expect(screen.queryByText(/22eb47a9/)).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(onSent).not.toHaveBeenCalled();
  });

  it('maps a version conflict to a sentence', async () => {
    mocks.requestClassChange.mockResolvedValue({ error: { code: '40001' } });
    const user = userEvent.setup();
    renderSheet();
    await user.click(screen.getByRole('radio', { name: /Container Advanced/ }));
    await user.click(screen.getByRole('radio', { name: 'Wrong section' }));
    await user.click(screen.getByRole('button', { name: 'Send request' }));
    expect(
      await screen.findByText('Someone else changed this entry. Reopen it and try again.')
    ).toBeInTheDocument();
  });

  it('says so offline and does not send', async () => {
    mocks.isOnline.mockReturnValue(false);
    renderSheet();
    expect(
      screen.getByText(
        'You need a connection to ask for a class change. Try again when you are back online.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send request' })).toBeDisabled();
    expect(mocks.requestClassChange).not.toHaveBeenCalled();
  });

  describe('the late warning (MYK9-2122)', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      mocks.classes = [
        availability({
          classId: 'class-adv',
          className: 'Container Advanced',
          trialDate: '2026-11-16',
          trialPlannedStartTime: '9:00 AM',
          trialTimezone: 'UTC',
        }),
      ];
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('warns, and still sends, when asked inside 30 minutes of the trial start', async () => {
      vi.setSystemTime(new Date('2026-11-16T08:45:00Z'));
      const user = userEvent.setup({ advanceTimers: () => undefined });
      renderSheet();
      expect(screen.queryByText(LATE_WARNING)).not.toBeInTheDocument();
      await user.click(screen.getByRole('radio', { name: /Container Advanced/ }));
      await user.click(screen.getByRole('radio', { name: 'Finished this level' }));
      expect(screen.getByText(LATE_WARNING)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Send request' }));
      await waitFor(() => expect(mocks.requestClassChange).toHaveBeenCalled());
    });

    it('says nothing when the trial is more than 30 minutes away', async () => {
      vi.setSystemTime(new Date('2026-11-16T07:00:00Z'));
      const user = userEvent.setup({ advanceTimers: () => undefined });
      renderSheet();
      await user.click(screen.getByRole('radio', { name: /Container Advanced/ }));
      expect(screen.queryByText(LATE_WARNING)).not.toBeInTheDocument();
    });
  });
});
