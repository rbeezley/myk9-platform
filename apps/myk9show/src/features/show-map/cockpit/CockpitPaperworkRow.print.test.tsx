import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen } from '@/test/utils/testUtils';
import type { SecretaryCockpitPaperwork } from './secretaryCockpitTypes';

const mocks = vi.hoisted(() => ({ voidPaperworkPrint: vi.fn() }));

vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => ({ user: { id: 'u1' } }) }));
vi.mock('./paperworkPrintActions', () => ({
  recordPaperworkPrinted: vi.fn(),
  voidPaperworkPrint: mocks.voidPaperworkPrint,
}));

import { CockpitPaperworkRow } from './CockpitPaperworkRow';

const printed: SecretaryCockpitPaperwork = {
  reportId: 'check-in-sheet',
  label: 'Check-in sheet',
  state: 'current',
  printHref: '/shows/s/reports',
  recordId: 'rec-1',
  printedAt: '2026-10-16T18:14:00.000Z',
  printedBy: 'Jannie',
  coveredByScope: 'class',
  confirmation: {
    scope: { kind: 'class', showId: 's', trialId: 't', classId: 'c' },
    coverage: {},
    fingerprint: 'fp',
  },
};

describe('CockpitPaperworkRow print flow', () => {
  beforeEach(() => {
    mocks.voidPaperworkPrint.mockReset();
  });

  it('shows a persistent printed line with an Undo that marks the sheet not printed', async () => {
    render(
      <CockpitPaperworkRow
        item={printed}
        timeZone="America/New_York"
        onCommand={vi.fn()}
        onPrint={vi.fn()}
      />
    );
    expect(screen.getByText(/Printed 2:14 PM/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mark Check-in sheet not printed' }));
    expect(mocks.voidPaperworkPrint).toHaveBeenCalledWith(
      expect.objectContaining({ recordId: 'rec-1' })
    );
  });

  it('offers no Undo on a record that covers more than this class', () => {
    render(
      <CockpitPaperworkRow
        item={{ ...printed, coveredByScope: 'trial' }}
        timeZone="America/New_York"
        onCommand={vi.fn()}
        onPrint={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: /not printed/ })).not.toBeInTheDocument();
  });

  it('prints in place and drops the manual record step when a print handler is given', async () => {
    const onPrint = vi.fn();
    render(
      <CockpitPaperworkRow
        item={{ ...printed, printedAt: undefined, recordId: undefined, state: 'unconfirmed' }}
        timeZone="America/New_York"
        onCommand={vi.fn()}
        onPrint={onPrint}
      />
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText('Record as printed')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(onPrint).toHaveBeenCalledOnce();
  });

  it('ticks a sheet for the batch', async () => {
    const onSelectedChange = vi.fn();
    render(
      <CockpitPaperworkRow
        item={printed}
        timeZone="America/New_York"
        onCommand={vi.fn()}
        onPrint={vi.fn()}
        selected={false}
        onSelectedChange={onSelectedChange}
      />
    );
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Check-in sheet to print' }));
    expect(onSelectedChange).toHaveBeenCalledWith(true);
  });
});
