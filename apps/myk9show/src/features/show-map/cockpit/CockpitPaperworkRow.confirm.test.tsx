import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen } from '@/test/utils/testUtils';
import type { SecretaryCockpitPaperwork } from './secretaryCockpitTypes';

const mocks = vi.hoisted(() => ({ recordPaperworkPrinted: vi.fn() }));

vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => ({ user: { id: 'u1' } }) }));
vi.mock('./paperworkPrintActions', () => ({
  recordPaperworkPrinted: mocks.recordPaperworkPrinted,
  voidPaperworkPrint: vi.fn(),
}));

import { CockpitPaperworkRow } from './CockpitPaperworkRow';

const item: SecretaryCockpitPaperwork = {
  reportId: 'results-sheet',
  label: 'Results sheet',
  state: 'none',
  printHref: '/shows/s/reports',
  confirmation: {
    scope: { kind: 'class', showId: 's', trialId: 't', classId: 'c' },
    coverage: {},
    fingerprint: 'fp',
  },
} as SecretaryCockpitPaperwork;

function renderRow(confirmInline?: boolean) {
  return render(
    <CockpitPaperworkRow
      item={item}
      timeZone="America/New_York"
      onCommand={vi.fn()}
      {...(confirmInline && { confirmInline })}
    />
  );
}

describe('CockpitPaperworkRow print confirmation', () => {
  beforeEach(() => {
    mocks.recordPaperworkPrinted.mockReset();
    mocks.recordPaperworkPrinted.mockResolvedValue(undefined);
  });

  it('asks in an AlertDialog by default', async () => {
    renderRow();
    await userEvent.click(screen.getByRole('button', { name: 'Record as printed' }));
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mark printed' }));
    expect(mocks.recordPaperworkPrinted).toHaveBeenCalledTimes(1);
  });

  it('asks inline with no dialog when hosted in a slide-out, and records the same way', async () => {
    renderRow(true);
    await userEvent.click(screen.getByRole('button', { name: 'Record as printed' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText('Did the Results sheet print correctly?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mark printed' }));
    expect(mocks.recordPaperworkPrinted).toHaveBeenCalledTimes(1);
    expect(mocks.recordPaperworkPrinted).toHaveBeenCalledWith(
      expect.objectContaining({
        descriptor: expect.objectContaining({ reportId: 'results-sheet', fingerprint: 'fp' }),
        message: 'Results sheet recorded as printed.',
      })
    );
    expect(screen.queryByText('Did the Results sheet print correctly?')).toBeNull();
  });

  it('Not yet closes the inline question without recording', async () => {
    renderRow(true);
    await userEvent.click(screen.getByRole('button', { name: 'Record as printed' }));
    await userEvent.click(screen.getByRole('button', { name: 'Not yet' }));
    expect(screen.queryByText('Did the Results sheet print correctly?')).toBeNull();
    expect(mocks.recordPaperworkPrinted).not.toHaveBeenCalled();
  });
});
