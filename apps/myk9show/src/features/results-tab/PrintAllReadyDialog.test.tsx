import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen } from '@/test/utils/testUtils';
import type { ResultsClassRow } from './buildResultsClassRows';
import { PrintAllReadyDialog } from './PrintAllReadyDialog';

vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => ({ user: { id: 'u1' } }) }));

const row = {
  id: 'c1',
  name: 'Containers Open',
  trialLabel: 'Trial 1',
  phase: 'released',
  paperwork: [
    {
      reportId: 'results-sheet',
      label: 'Results',
      state: 'none',
      printHref: '/r',
      confirmation: {
        scope: { kind: 'class', showId: 's', trialId: 't', classId: 'c1' },
        coverage: {},
        fingerprint: 'fp',
      },
    },
  ],
} as unknown as ResultsClassRow;

describe('PrintAllReadyDialog', () => {
  it('asks the print question inline in the slide-out, never in a stacked dialog', async () => {
    render(
      <PrintAllReadyDialog
        rows={[row]}
        timeZone="America/New_York"
        paperworkAvailable
        onRetry={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /Print all ready/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Record as printed' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText('Did the Results sheet print correctly?')).toBeInTheDocument();
  });
});
