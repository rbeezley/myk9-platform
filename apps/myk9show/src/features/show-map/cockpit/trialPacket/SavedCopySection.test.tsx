import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen, waitFor, within } from '@/test/utils/testUtils';
import { EmergencyPacketDeliveryError } from '@/features/emergency-trial-packet/deliverEmergencyTrialPacket';
import type { DeliveredPacketRow } from '@/pages/secretary/ReportsPage/deliveredPacketRows';

const DAY = '2026-12-08';
const OTHER_DAY = '2026-12-07';

const mocks = vi.hoisted(() => ({
  packetData: null as unknown,
  copies: [] as unknown[],
  rows: [] as unknown[],
  isError: false,
  listState: 'ready' as 'pending' | 'offline' | 'error' | 'ready',
  trialRows: [] as unknown[],
  classRows: [] as unknown[],
  markDeferred: null as null | (() => void),
  build: vi.fn(),
  deliver: vi.fn(),
  record: vi.fn(),
  reportData: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useFastShowDetails', () => ({ useFastShowDetails: () => ({ show: {} }) }));
vi.mock('@/hooks/queries/useReportData', () => ({
  useReportData: (...args: unknown[]) => {
    mocks.reportData(...args);
    return {
      show: {},
      trials: [],
      classes: [],
      entries: [],
      isReady: true,
      registrationsReadComplete: true,
    };
  },
}));
vi.mock('@/features/emergency-trial-packet/completePacketRows', () => ({
  completePacketRows: () => ({
    trials: mocks.trialRows,
    classes: mocks.classRows,
    entries: [],
  }),
}));
vi.mock('@/pages/secretary/ReportsPage/reportDataMapping', () => ({
  buildEmergencyPacketData: () => mocks.packetData,
}));
vi.mock('@/pages/secretary/ReportsPage/useDeliveredPackets', async importOriginal => ({
  ...(await importOriginal<typeof import('@/pages/secretary/ReportsPage/useDeliveredPackets')>()),
  useDeliveredPackets: () => ({
    rows: mocks.rows,
    copies: mocks.copies,
    isError: mocks.listState === 'error',
    listState: mocks.listState,
  }),
}));
vi.mock('./buildSavedCopy', () => ({ buildSavedCopy: mocks.build }));
vi.mock('@/features/emergency-trial-packet/deliverEmergencyTrialPacket', async importOriginal => ({
  ...(await importOriginal<
    typeof import('@/features/emergency-trial-packet/deliverEmergencyTrialPacket')
  >()),
  deliverEmergencyTrialPacket: mocks.deliver,
}));
vi.mock('../paperworkPrintActions', () => ({ recordPaperworkPrinted: mocks.record }));

import { SavedCopySection } from './SavedCopySection';

function packetData() {
  return {
    show: { id: 'show-1', name: 'Winter Trial', startDate: OTHER_DAY, endDate: DAY },
    trials: [
      { id: 't-sun', date: DAY, name: 'Trial 2', trialNumber: '2', registryId: 'AKC' },
      { id: 't-sat', date: OTHER_DAY, name: 'Trial 1', trialNumber: '1', registryId: 'AKC' },
    ],
    classes: [
      { id: 'c-sun', trialId: 't-sun', judgeName: 'TBD' },
      { id: 'c-sat', trialId: 't-sat', judgeName: 'Pat Donovan' },
    ],
    entries: [
      { id: 'e-sun', classId: 'c-sun', trialId: 't-sun' },
      { id: 'e-sat', classId: 'c-sat', trialId: 't-sat' },
    ],
  };
}

function latestRow(overrides: Partial<DeliveredPacketRow>): DeliveredPacketRow {
  return {
    trialDate: DAY,
    snapshotId: 'snap-new',
    generatedAt: '2026-12-07T23:00:00.000Z',
    pageCount: 12,
    printState: 'unconfirmed',
    descriptor: { reportId: 'emergency-trial-packet' } as never,
    ...overrides,
  };
}

const COPIES = [
  {
    snapshotId: 'snap-new',
    trialDate: DAY,
    generatedAt: '2026-12-07T23:00:00.000Z',
    createdAt: '2026-12-07T23:00:01.000Z',
    pageCount: 12,
    recipientCount: 3,
  },
  {
    snapshotId: 'snap-old',
    trialDate: DAY,
    generatedAt: '2026-12-06T23:00:00.000Z',
    createdAt: '2026-12-06T23:00:01.000Z',
    pageCount: 10,
    recipientCount: 2,
  },
  {
    snapshotId: 'snap-other-day',
    trialDate: OTHER_DAY,
    generatedAt: '2026-12-06T23:00:00.000Z',
    createdAt: '2026-12-06T23:00:01.000Z',
    pageCount: 99,
    recipientCount: 9,
  },
];

/** Renders the section and opens it, as the secretary does. */
async function openSection(trialDate = DAY) {
  const user = userEvent.setup();
  render(<SavedCopySection showId="show-1" trialDate={trialDate} />);
  await user.click(screen.getByRole('button', { name: 'Show saved copies' }));
  return user;
}

describe('SavedCopySection', () => {
  it('reads the show data only once the secretary opens it', async () => {
    const user = userEvent.setup();
    render(<SavedCopySection showId="show-1" trialDate={DAY} />);
    expect(mocks.reportData).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Save and email a copy' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show saved copies' }));

    expect(mocks.reportData).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save and email a copy' })).toBeInTheDocument();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.packetData = packetData();
    mocks.copies = [];
    mocks.rows = [];
    mocks.listState = 'ready';
    mocks.trialRows = [
      { id: 't-sat', timezone: 'America/Chicago', status: null },
      { id: 't-sun', timezone: null, status: null },
    ];
    mocks.classRows = [
      { id: 'c-sun', trial_id: 't-sun', status: null },
      { id: 'c-sat', trial_id: 't-sat', status: null },
    ];
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    mocks.build.mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]), pageCount: 7 });
    mocks.deliver.mockResolvedValue({ recipientCount: 4, snapshotId: 's', pageCount: 7 });
    mocks.record.mockResolvedValue(undefined);
  });

  it("lists only this day's copies with pages and officials, and the printed state of the newest", async () => {
    mocks.copies = COPIES;
    mocks.rows = [latestRow({ printState: 'printed' })];
    await openSection();

    const list = screen.getByRole('list', { name: 'Copies already sent' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('12 pages');
    expect(items[0]).toHaveTextContent('received by 3 officials');
    expect(items[0]).toHaveTextContent('Paper matching this copy is marked printed.');
    expect(items[1]).toHaveTextContent('10 pages');
    expect(items[1]).toHaveTextContent('received by 2 officials');
    expect(items[1]).toHaveTextContent('A newer copy replaced this one.');
    expect(screen.queryByText(/99 pages/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark printed' })).not.toBeInTheDocument();
  });

  it('says so when no copy has been sent for the day', async () => {
    await openSection();
    expect(screen.getByText('No copy has been sent for this day yet.')).toBeInTheDocument();
  });

  it('marks the newest copy printed through the confirmation dialog', async () => {
    mocks.copies = COPIES;
    mocks.rows = [latestRow({})];
    const user = await openSection();

    await user.click(screen.getByRole('button', { name: 'Mark printed' }));
    expect(mocks.record).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Mark printed' }));

    await waitFor(() =>
      expect(mocks.record).toHaveBeenCalledWith(
        expect.objectContaining({ descriptor: { reportId: 'emergency-trial-packet' } })
      )
    );
  });

  it("builds the chosen day from that day only and delivers with that day's date", async () => {
    const user = await openSection();
    expect(mocks.build).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Save and email a copy' }));

    await waitFor(() => expect(mocks.deliver).toHaveBeenCalledTimes(1));
    const built = mocks.build.mock.calls[0]![0] as {
      trials: Array<{ id: string; date: string; timezone: string }>;
      classes: Array<{ id: string; judgeName: string }>;
    };
    expect(built.trials).toEqual([
      expect.objectContaining({ id: 't-sun', date: DAY, timezone: 'America/New_York' }),
    ]);
    expect(built.classes).toEqual([expect.objectContaining({ id: 'c-sun', judgeName: '' })]);
    expect(mocks.deliver).toHaveBeenCalledWith({
      showId: 'show-1',
      snapshotId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      generatedAt: expect.any(String),
      bytes: new Uint8Array([1, 2, 3]),
      pageCount: 7,
      trialDate: DAY,
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'copy stored and emailed to 4 show officials.'
    );
  });

  it('says the copy was stored but not emailed', async () => {
    mocks.deliver.mockRejectedValue(new EmergencyPacketDeliveryError('show-1/x.pdf'));
    const user = await openSection();
    await user.click(screen.getByRole('button', { name: 'Save and email a copy' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /stored, but the email could not be sent\. The stored copy is not listed .*fresh copy\./
    );
  });

  it('says the copy could not be saved when the build or upload fails', async () => {
    mocks.build.mockRejectedValue(new Error('boom'));
    const user = await openSection();
    await user.click(screen.getByRole('button', { name: 'Save and email a copy' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The copy could not be saved.');
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it("gives a day the show has no trial on a disabled button and the old panel's reason", async () => {
    await openSection('2027-01-01');
    expect(screen.getByRole('button', { name: 'Save and email a copy' })).toBeDisabled();
    expect(
      screen.getByText('Add a trial before preparing the emergency packet.')
    ).toBeInTheDocument();
  });

  it('disables the button when the day has no entries to print', async () => {
    mocks.packetData = { ...(packetData() as object), entries: [] };
    await openSection();
    expect(screen.getByRole('button', { name: 'Save and email a copy' })).toBeDisabled();
    expect(
      screen.getByText('No entries are ready for an emergency packet yet.')
    ).toBeInTheDocument();
  });

  it('leaves a cancelled class and its entries out of the built copy', async () => {
    mocks.packetData = {
      ...(packetData() as { classes: unknown[]; entries: unknown[] }),
      classes: [
        { id: 'c-sun', trialId: 't-sun', judgeName: 'Pat' },
        { id: 'c-sun-2', trialId: 't-sun', judgeName: 'Sam' },
      ],
      entries: [
        { id: 'e1', classId: 'c-sun', trialId: 't-sun' },
        { id: 'e2', classId: 'c-sun-2', trialId: 't-sun' },
      ],
    };
    mocks.classRows = [
      { id: 'c-sun', trial_id: 't-sun', status: null },
      { id: 'c-sun-2', trial_id: 't-sun', status: 'cancelled' },
    ];
    const user = await openSection();
    await user.click(screen.getByRole('button', { name: 'Save and email a copy' }));
    await waitFor(() => expect(mocks.build).toHaveBeenCalled());
    const built = mocks.build.mock.calls[0]![0] as {
      classes: Array<{ id: string }>;
      entries: Array<{ id: string }>;
    };
    expect(built.classes.map(item => item.id)).toEqual(['c-sun']);
    expect(built.entries.map(item => item.id)).toEqual(['e1']);
  });

  it('gives a day whose only trial is cancelled no copy to send', async () => {
    mocks.trialRows = [
      { id: 't-sat', timezone: null, status: null },
      { id: 't-sun', timezone: null, status: 'cancelled' },
    ];
    await openSection();
    expect(screen.getByRole('button', { name: 'Save and email a copy' })).toBeDisabled();
    expect(
      screen.getByText('Add a trial before preparing the emergency packet.')
    ).toBeInTheDocument();
  });

  it('shows a checking line and keeps the button off while the sent copies are being read', async () => {
    mocks.listState = 'pending';
    await openSection();
    expect(screen.getAllByText('Checking which copies were already sent…').length).toBeGreaterThan(
      0
    );
    expect(screen.queryByText('No copy has been sent for this day yet.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save and email a copy' })).toBeDisabled();
  });

  it('says it is offline, not "nothing sent", when the read is paused', async () => {
    mocks.listState = 'offline';
    await openSection();
    expect(screen.getAllByText(/You are offline\./).length).toBeGreaterThan(0);
    expect(screen.queryByText('No copy has been sent for this day yet.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save and email a copy' })).toBeDisabled();
  });

  it('does not show the empty line and keeps the button off when the read failed', async () => {
    mocks.listState = 'error';
    await openSection();
    expect(screen.queryByText('No copy has been sent for this day yet.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save and email a copy' })).toBeDisabled();
  });

  it('does not build when the device is offline at the press', async () => {
    const user = await openSection();
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    await user.click(screen.getByRole('button', { name: 'Save and email a copy' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('You are offline.');
    expect(mocks.build).not.toHaveBeenCalled();
    expect(mocks.deliver).not.toHaveBeenCalled();
  });

  it('has one toggle that flips aria-expanded and unmounts the body when closed', async () => {
    const user = userEvent.setup();
    render(<SavedCopySection showId="show-1" trialDate={DAY} />);
    const toggle = screen.getByRole('button', { name: 'Show saved copies' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    const hide = screen.getByRole('button', { name: 'Hide saved copies' });
    expect(hide).toBe(toggle);
    expect(hide).toHaveAttribute('aria-expanded', 'true');
    const controls = hide.getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    expect(document.getElementById(controls as string)).toContainElement(
      screen.getByRole('button', { name: 'Save and email a copy' })
    );
    await user.click(hide);
    expect(screen.queryByRole('button', { name: 'Save and email a copy' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show saved copies' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('hides the officials count when it is 0 and names a send that reached nobody', async () => {
    mocks.copies = [{ ...COPIES[0]!, recipientCount: 0 }];
    mocks.rows = [latestRow({})];
    mocks.deliver.mockResolvedValue({ recipientCount: 0, snapshotId: 's', pageCount: 7 });
    const user = await openSection();
    expect(screen.getByRole('list', { name: 'Copies already sent' })).not.toHaveTextContent(
      'received by'
    );
    await user.click(screen.getByRole('button', { name: 'Save and email a copy' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Stored, but no show official has an email on file, so nobody was emailed.'
    );
  });

  it('holds the confirm dialog busy while the print record is being written', async () => {
    let finish: () => void = () => {};
    mocks.record.mockReturnValue(new Promise<void>(resolve => (finish = resolve)));
    mocks.copies = COPIES;
    mocks.rows = [latestRow({})];
    const user = await openSection();
    await user.click(screen.getByRole('button', { name: 'Mark printed' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Mark printed' }));
    expect(await within(dialog).findByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(mocks.record).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('explains the missing Mark printed button beside the newest copy while data loads', async () => {
    mocks.copies = COPIES;
    mocks.rows = [latestRow({ descriptor: null })];
    await openSection();
    expect(screen.queryByRole('button', { name: 'Mark printed' })).not.toBeInTheDocument();
    expect(
      screen.getByText(/Mark printed appears once the show's data has loaded/)
    ).toBeInTheDocument();
  });

  it('warns when the list of sent copies could not be read', async () => {
    mocks.listState = 'error';
    await openSection();
    expect(screen.getByRole('alert')).toHaveTextContent('could not check which copies');
  });

  it('keeps the button off until the show data is ready', async () => {
    mocks.packetData = null;
    await openSection();
    expect(screen.getByRole('button', { name: 'Save and email a copy' })).toBeDisabled();
  });
});
