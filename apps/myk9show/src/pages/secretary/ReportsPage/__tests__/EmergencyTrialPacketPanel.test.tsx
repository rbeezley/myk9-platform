import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/utils/testUtils';
import { EmergencyTrialPacketPanel } from '../EmergencyTrialPacketPanel';
import type { EmergencyPacketInput } from '@/features/emergency-trial-packet/types';
import { buildEmergencyPacketPaperworkDescriptor } from '@/features/show-map/cockpit/paperworkPrintState';

const data: Omit<EmergencyPacketInput, 'generatedAt'> = {
  show: {
    id: 'show-1',
    name: 'Prairie Trial',
    clubName: 'Prairie Club',
    organization: 'AKC',
    startDate: '2026-10-03',
    endDate: '2026-10-04',
  },
  trials: [{ id: 't1', date: '2026-10-03', name: 'Trial 1', trialNumber: '1', registryId: 'AKC' }],
  classes: [
    {
      id: 'c1',
      trialId: 't1',
      name: 'Container Novice',
      element: 'Container',
      level: 'Novice',
      section: null,
      classNumber: '101',
      displayOrder: 1,
      judgeName: 'Judge One',
      ringLabel: 'Ring 1',
      startTime: '08:00',
      timeLimitSeconds: 120,
      timeLimitArea2Seconds: null,
      timeLimitArea3Seconds: null,
      numAreas: null,
      numHides: null,
      distractionCount: null,
    },
  ],
  entries: [
    {
      id: 'e1',
      armband: '101',
      runOrder: 1,
      callName: 'Maple',
      breed: 'All-American Dog',
      handler: 'Handler One',
      registrationNumber: null,
      checkInStatus: null,
      section: null,
      isScored: false,
      resultText: null,
      searchTimeSeconds: null,
      totalFaults: null,
      finalPlacement: null,
      classId: 'c1',
      trialId: 't1',
    },
  ],
};

describe('EmergencyTrialPacketPanel', () => {
  it('explains why preparation is unavailable instead of uploading an empty packet', () => {
    render(<EmergencyTrialPacketPanel data={{ ...data, entries: [] }} />);
    expect(screen.getByRole('button', { name: /prepare and email packet/i })).toBeDisabled();
    expect(screen.getByText(/no entries are ready/i)).toBeInTheDocument();
  });

  it('shows delivery evidence and makes the physical trial box the next action', async () => {
    const user = userEvent.setup();
    const prepare = vi.fn().mockResolvedValue({
      snapshotId: 'snapshot-1',
      generatedAt: '2026-08-20T22:00:00.000Z',
      recipientCount: 2,
      linkExpiresAt: '2026-10-19T22:00:00.000Z',
      pageCount: 8,
    });
    const onMarkPrinted = vi.fn();
    render(
      <EmergencyTrialPacketPanel data={data} prepare={prepare} onMarkPrinted={onMarkPrinted} />
    );

    await user.click(screen.getByRole('button', { name: /prepare and email packet/i }));

    expect(await screen.findByText(/print it and put it in the trial box/i)).toBeInTheDocument();
    expect(screen.getByText(/emailed to 2 show officials/i)).toBeInTheDocument();
    expect(screen.getByText(/generated .*8 pages.*link expires/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /mark .* packet printed/i }));
    expect(onMarkPrinted).toHaveBeenCalledWith(
      expect.objectContaining({ reportId: 'emergency-trial-packet' })
    );
  });

  it('keeps delivery failure recoverable and does not claim physical readiness', async () => {
    const user = userEvent.setup();
    const prepare = vi.fn().mockRejectedValue(new Error('email failed'));
    render(<EmergencyTrialPacketPanel data={data} prepare={prepare} />);

    await user.click(screen.getByRole('button', { name: /prepare and email packet/i }));

    expect(await screen.findByText(/could not email the packet/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mark .* packet printed/i })).toBeNull();
    expect(screen.getByRole('button', { name: /try again/i })).toBeEnabled();
  });

  it('binds print evidence to the generated snapshot when report data later changes', async () => {
    const user = userEvent.setup();
    const prepare = vi.fn().mockResolvedValue({
      snapshotId: 'snapshot-1',
      generatedAt: '2026-08-20T22:00:00.000Z',
      recipientCount: 2,
      linkExpiresAt: '2026-10-19T22:00:00.000Z',
      pageCount: 8,
    });
    const onMarkPrinted = vi.fn();
    const view = render(
      <EmergencyTrialPacketPanel data={data} prepare={prepare} onMarkPrinted={onMarkPrinted} />
    );

    await user.click(screen.getByRole('button', { name: /prepare and email packet/i }));
    await screen.findByRole('button', { name: /mark .* packet printed/i });
    view.rerender(
      <EmergencyTrialPacketPanel
        data={{
          ...data,
          entries: [{ ...data.entries[0], id: 'e2' }],
        }}
        prepare={prepare}
        onMarkPrinted={onMarkPrinted}
      />
    );

    await user.click(screen.getByRole('button', { name: /mark .* packet printed/i }));
    expect(onMarkPrinted).toHaveBeenCalledWith(
      buildEmergencyPacketPaperworkDescriptor({
        showId: 'show-1',
        trialDate: '2026-10-03',
        snapshotId: 'snapshot-1',
        generatedAt: '2026-08-20T22:00:00.000Z',
        entryIds: ['e1'],
        classIds: ['c1'],
        trialIds: ['t1'],
      })
    );

    // Comparing against the builder alone would pass whatever the builder
    // did. The subject key is the contract the print reminder reads back from
    // the server, so assert its literal shape (MYK9-228 phase 5).
    const descriptor = onMarkPrinted.mock.calls[0][0];
    expect(Object.keys(descriptor.coverage.subjectFingerprints)).toEqual(['packet-day:2026-10-03']);
    expect(descriptor.reportId).toBe('emergency-trial-packet');
  });

  /**
   * MYK9-228. A show is the weekend; a trial is a unit inside it and a day can
   * hold several. One packet per DAY, so a nightly regeneration does not
   * reprint the previous day's spent pages and leave two look-alike stacks.
   */
  it('prepares one packet per trial day, not one for the whole show', async () => {
    const user = userEvent.setup();
    const twoDays = {
      ...data,
      trials: [
        ...data.trials,
        { id: 't2', date: '2026-10-04', name: 'Trial 2', trialNumber: '2', registryId: 'AKC' },
      ],
      classes: [...data.classes, { ...data.classes[0], id: 'c2', trialId: 't2' }],
      entries: [...data.entries, { ...data.entries[0], id: 'e2', classId: 'c2', trialId: 't2' }],
    };
    let n = 0;
    const prepare = vi.fn().mockImplementation(() => {
      n += 1;
      return Promise.resolve({
        snapshotId: `snap-${n}`,
        generatedAt: '2026-10-02T12:00:00.000Z',
        recipientCount: 2,
        linkExpiresAt: '2026-10-20T00:00:00.000Z',
        pageCount: 4,
      });
    });

    render(<EmergencyTrialPacketPanel data={twoDays} prepare={prepare} onMarkPrinted={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /prepare and email packet/i }));

    expect(prepare).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(/Sat, Oct 3 packet stored/i)).toBeInTheDocument();
    expect(screen.getByText(/Sun, Oct 4 packet stored/i)).toBeInTheDocument();
    // Each day gets its own print acknowledgement — that is the signal the
    // reminder will key off, and it is per day.
    expect(
      screen.getByRole('button', { name: /mark Sat, Oct 3 packet printed/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /mark Sun, Oct 4 packet printed/i })
    ).toBeInTheDocument();

    // And each packet must carry only its own day's work.
    const firstCall = prepare.mock.calls[0][0] as EmergencyPacketInput;
    expect(firstCall.trials.map(t => t.id)).toEqual(['t1']);
    expect(firstCall.entries.map(e => e.id)).toEqual(['e1']);
  });

  /**
   * MYK9-228 (Codex review). If Sunday fails after Saturday was stored and
   * emailed, discarding Saturday means the retry mints a SECOND snapshot and
   * sends a SECOND email for a day that already succeeded — producing exactly
   * the duplicate stacks the per-day split exists to prevent.
   */
  it('keeps a successful day and retries only the one that failed', async () => {
    const user = userEvent.setup();
    const twoDays = {
      ...data,
      trials: [
        ...data.trials,
        { id: 't2', date: '2026-10-04', name: 'Trial 2', trialNumber: '2', registryId: 'AKC' },
      ],
      classes: [...data.classes, { ...data.classes[0], id: 'c2', trialId: 't2' }],
      entries: [...data.entries, { ...data.entries[0], id: 'e2', classId: 'c2', trialId: 't2' }],
    };
    const ok = (id: string) => ({
      snapshotId: id,
      generatedAt: '2026-10-02T12:00:00.000Z',
      recipientCount: 2,
      linkExpiresAt: '2026-10-20T00:00:00.000Z',
      pageCount: 4,
    });
    const prepare = vi
      .fn()
      .mockResolvedValueOnce(ok('snap-sat'))
      .mockRejectedValueOnce(new Error('email failed'))
      .mockResolvedValueOnce(ok('snap-sun'));

    render(<EmergencyTrialPacketPanel data={twoDays} prepare={prepare} onMarkPrinted={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /prepare and email packet/i }));

    // Saturday survives the failure, and the retry is still offered.
    expect(await screen.findByText(/Sat, Oct 3 packet stored/i)).toBeInTheDocument();
    expect(screen.queryByText(/Sun, Oct 4 packet stored/i)).not.toBeInTheDocument();
    const retry = screen.getByRole('button', { name: /try again/i });

    await user.click(retry);

    expect(await screen.findByText(/Sun, Oct 4 packet stored/i)).toBeInTheDocument();
    // Three calls, not four: Saturday was never re-sent.
    expect(prepare).toHaveBeenCalledTimes(3);
    const retriedDates = prepare.mock.calls.map(call => (call[1] as string | undefined) ?? '');
    expect(retriedDates).toEqual(['2026-10-03', '2026-10-04', '2026-10-04']);
  });
});

/**
 * MYK9-228 phase 5. Once cron generates the packet overnight, the session-only
 * list is empty and the secretary needs a way to confirm the print WITHOUT
 * pressing Prepare — which would mint a new snapshot and email every official
 * a second copy. Without this the print reminder has no reachable off switch.
 */
describe('packets prepared outside this session', () => {
  const delivered = (overrides: Record<string, unknown> = {}) => ({
    trialDate: '2026-10-03',
    snapshotId: 'snap-cron',
    generatedAt: '2026-10-02T22:00:00.000Z',
    pageCount: 12,
    printState: 'unconfirmed' as const,
    descriptor: buildEmergencyPacketPaperworkDescriptor({
      showId: 'show-1',
      trialDate: '2026-10-03',
      snapshotId: 'snap-cron',
      generatedAt: '2026-10-02T22:00:00.000Z',
      entryIds: ['e1'],
      classIds: ['c1'],
      trialIds: ['t1'],
    }),
    ...overrides,
  });

  it('offers a print confirmation for a packet cron generated overnight', async () => {
    const user = userEvent.setup();
    const onMarkPrinted = vi.fn();
    render(
      <EmergencyTrialPacketPanel
        data={data}
        deliveredPackets={[delivered()]}
        onMarkPrinted={onMarkPrinted}
      />
    );

    await user.click(screen.getByRole('button', { name: /mark Sat, Oct 3 packet printed/i }));

    expect(onMarkPrinted).toHaveBeenCalledTimes(1);
    expect(onMarkPrinted.mock.calls[0][0].coverage.snapshotId).toBe('snap-cron');
  });

  it('shows a confirmed day as printed, with no button to press again', () => {
    render(
      <EmergencyTrialPacketPanel
        data={data}
        deliveredPackets={[delivered({ printState: 'printed' })]}
        onMarkPrinted={vi.fn()}
      />
    );

    expect(screen.getByText(/^Printed$/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mark Sat, Oct 3 packet printed/i })).toBeNull();
  });

  it('says a printed packet was replaced rather than calling it unprinted', () => {
    // Telling someone who printed Thursday's copy that it is simply
    // unconfirmed invites a second identical stack.
    render(
      <EmergencyTrialPacketPanel
        data={data}
        deliveredPackets={[delivered({ printState: 'superseded' })]}
        onMarkPrinted={vi.fn()}
      />
    );

    expect(screen.getByText(/newer packet replaced the one that was printed/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /mark Sat, Oct 3 packet printed/i })
    ).toBeInTheDocument();
  });

  it('does not offer two buttons for a day prepared in this session', async () => {
    const user = userEvent.setup();
    const prepare = vi.fn().mockResolvedValue({
      snapshotId: 'snapshot-1',
      generatedAt: '2026-08-20T22:00:00.000Z',
      recipientCount: 2,
      linkExpiresAt: '2026-10-19T22:00:00.000Z',
      pageCount: 8,
    });
    render(
      <EmergencyTrialPacketPanel
        data={data}
        deliveredPackets={[delivered()]}
        prepare={prepare}
        onMarkPrinted={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /prepare and email packet/i }));
    await screen.findByRole('button', { name: /mark .* packet printed/i });

    expect(screen.getAllByRole('button', { name: /mark Sat, Oct 3 packet printed/i })).toHaveLength(
      1
    );
  });
});

describe('a confirmed packet stays confirmed regardless of report scope', () => {
  const printedRow = {
    trialDate: '2026-10-03',
    snapshotId: 'snap-cron',
    generatedAt: '2026-10-02T22:00:00.000Z',
    pageCount: 12,
    printState: 'printed' as const,
    // Null whenever the report is narrowed to a trial or class, and while
    // data is loading — none of which unprints a packet.
    descriptor: null,
  };

  it('still says Printed when the report is narrowed and no descriptor exists', () => {
    render(
      <EmergencyTrialPacketPanel
        data={null}
        deliveredPackets={[printedRow]}
        onMarkPrinted={vi.fn()}
      />
    );

    expect(screen.getByText(/^Printed$/)).toBeInTheDocument();
    // The scope hint is for days that are NOT confirmed. Showing it here reads
    // as "not confirmed", and the obvious response is to widen the scope and
    // confirm again — a second row for a snapshot already confirmed.
    expect(screen.queryByText(/Choose All Trials and All Classes/i)).toBeNull();
  });

  it('does explain itself for an unconfirmed day with no descriptor', () => {
    render(
      <EmergencyTrialPacketPanel
        data={null}
        deliveredPackets={[{ ...printedRow, printState: 'unconfirmed' }]}
        onMarkPrinted={vi.fn()}
      />
    );

    expect(screen.getByText(/Choose All Trials and All Classes/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mark .* printed/i })).toBeNull();
  });
});
