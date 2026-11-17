/**
 * MYK9-1978: the class row's class change words and controls: the waiting line
 * with its stored target and reason, "Take back request", the declined line with
 * the secretary's reason, and the "Change class…" link.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { EntryStatus } from '@/types/show-registration-types';
import { ClassChangeRowControls } from './ClassChangeRowControls';
import type { MyShowClass } from './groupEntriesByShow';

const mocks = vi.hoisted(() => ({
  cancelClassChange: vi.fn(),
  getClassChangeRequestDetails: vi.fn(),
  getClassNamesByIds: vi.fn(),
}));

vi.mock('@/services/database/entries/classChangeRequests', async importActual => ({
  ...(await importActual<typeof import('@/services/database/entries/classChangeRequests')>()),
  cancelClassChange: mocks.cancelClassChange,
  getClassChangeRequestDetails: mocks.getClassChangeRequestDetails,
  getClassNamesByIds: mocks.getClassNamesByIds,
}));
vi.mock('@/hooks/useClassAvailability', () => ({
  useClassAvailability: () => ({ classes: [], isLoading: false, error: null }),
}));

function row(overrides: Partial<MyShowClass>): MyShowClass {
  return {
    id: 'entry-1',
    classId: 'class-novice-a',
    name: 'Container Novice A',
    number: '1',
    fee: 0,
    status: 'entered',
    entryStatusKind: 'accepted',
    orderId: 'order-1',
    registrationId: null,
    entryStatus: EntryStatus.ACCEPTED,
    ...overrides,
  } as MyShowClass;
}

function renderControls(cls: MyShowClass, canChange = false, onChanged = vi.fn()) {
  render(
    <ClassChangeRowControls
      cls={cls}
      dogName="Scout"
      showId="show-1"
      dogClassIds={new Set()}
      canChange={canChange}
      onChanged={onChanged}
    />
  );
  return onChanged;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cancelClassChange.mockResolvedValue({ error: null });
  mocks.getClassChangeRequestDetails.mockResolvedValue({
    'entry-1': {
      entryId: 'entry-1',
      targetClassId: 'class-adv',
      reason: 'finished_level',
      requestedAt: '2026-11-16T12:00:00Z',
    },
  });
  mocks.getClassNamesByIds.mockResolvedValue({ 'class-adv': 'Container Advanced' });
});

describe('ClassChangeRowControls', () => {
  it('shows the waiting line with the stored class and reason', async () => {
    renderControls(row({ entryStatus: EntryStatus.MOVE_UP_REQUESTED }));
    expect(
      await screen.findByText(
        'Change requested: Container Advanced. Waiting for the secretary. Finished this level.'
      )
    ).toBeInTheDocument();
    expect(mocks.getClassChangeRequestDetails).toHaveBeenCalledWith(['entry-1']);
    expect(screen.queryByRole('button', { name: /Change class/ })).not.toBeInTheDocument();
  });

  it('takes the request back with the entry id, then re-reads the entries', async () => {
    const user = userEvent.setup();
    const onChanged = renderControls(row({ entryStatus: EntryStatus.MOVE_UP_REQUESTED }));
    await user.click(await screen.findByRole('button', { name: /Take back class change request/ }));

    await waitFor(() => expect(mocks.cancelClassChange).toHaveBeenCalledWith('entry-1'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(screen.queryByText(/Change requested/)).not.toBeInTheDocument();
  });

  it('keeps the request showing and says why when taking it back is refused', async () => {
    mocks.cancelClassChange.mockResolvedValue({ error: { hint: 'no_open_request' } });
    const user = userEvent.setup();
    renderControls(row({ entryStatus: EntryStatus.MOVE_UP_REQUESTED }));
    await user.click(await screen.findByRole('button', { name: /Take back class change request/ }));
    await waitFor(() => expect(mocks.cancelClassChange).toHaveBeenCalled());
    expect(screen.getByText(/Change requested/)).toBeInTheDocument();
  });

  it('shows the secretary reason on a declined request', () => {
    renderControls(row({ specialRequests: 'Move-up denied: Class is closed to changes' }));
    expect(
      screen.getByText('Class change declined: Class is closed to changes')
    ).toBeInTheDocument();
  });

  it('says declined without a reason when none was given', () => {
    renderControls(row({ specialRequests: 'Move-up request denied' }));
    expect(screen.getByText('Class change declined.')).toBeInTheDocument();
  });

  it('shows nothing for an accepted entry with no request', () => {
    renderControls(row({ specialRequests: 'Bring a crate' }));
    expect(screen.queryByText(/declined|Change requested/)).not.toBeInTheDocument();
  });

  it('offers Change class… only when the row allows it', () => {
    renderControls(row({}), true);
    expect(screen.getByRole('button', { name: /Change class: Scout/ })).toBeInTheDocument();
  });
});
