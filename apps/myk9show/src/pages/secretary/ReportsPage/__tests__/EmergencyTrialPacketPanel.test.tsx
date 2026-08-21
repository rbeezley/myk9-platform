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
  classes: [{
    id: 'c1', trialId: 't1', name: 'Container Novice', element: 'Container', level: 'Novice',
    section: null, classNumber: '101', displayOrder: 1, judgeName: 'Judge One', ringLabel: 'Ring 1',
    startTime: '08:00', timeLimitSeconds: 120,
  }],
  entries: [{
    id: 'e1', armband: 101, runOrder: 1, callName: 'Maple', breed: 'All-American Dog',
    handler: 'Handler One', registrationNumber: null, checkInStatus: null, section: null,
    isScored: false, resultText: null, searchTimeSeconds: null, totalFaults: null,
    finalPlacement: null, classId: 'c1', trialId: 't1',
  }],
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
    await user.click(screen.getByRole('button', { name: /mark packet printed/i }));
    expect(onMarkPrinted).toHaveBeenCalledWith(expect.objectContaining({ reportId: 'emergency-trial-packet' }));
  });

  it('keeps delivery failure recoverable and does not claim physical readiness', async () => {
    const user = userEvent.setup();
    const prepare = vi.fn().mockRejectedValue(new Error('email failed'));
    render(<EmergencyTrialPacketPanel data={data} prepare={prepare} />);

    await user.click(screen.getByRole('button', { name: /prepare and email packet/i }));

    expect(await screen.findByText(/could not email the packet/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mark packet printed/i })).toBeNull();
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
    await screen.findByRole('button', { name: /mark packet printed/i });
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

    await user.click(screen.getByRole('button', { name: /mark packet printed/i }));
    expect(onMarkPrinted).toHaveBeenCalledWith(
      buildEmergencyPacketPaperworkDescriptor({
        showId: 'show-1',
        snapshotId: 'snapshot-1',
        generatedAt: '2026-08-20T22:00:00.000Z',
        entryIds: ['e1'],
        classIds: ['c1'],
        trialIds: ['t1'],
      })
    );
  });
});
