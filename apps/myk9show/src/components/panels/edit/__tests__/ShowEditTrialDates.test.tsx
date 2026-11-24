import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ShowEditTrialDates } from '../ShowEditTrialDates';
import { formatShowDatesText } from '../formatShowDatesText';
import { EditPanelContext, type EditPanelContextValue } from '../useEditPanel';
import { formDataToShow } from '../ShowEditPanel.helpers';
import { showSchemas } from '@/lib/validation';
import type { ShowEditFormData } from '../ShowEditPanel.types';

describe('formatShowDatesText', () => {
  it('names one day once (a one-day show)', () => {
    expect(formatShowDatesText('2026-12-12T00:00:00+00:00', '2026-12-12T00:00:00+00:00')).toBe(
      'Dec 12, 2026'
    );
  });

  it('names the first and last day of a multi-day show', () => {
    expect(formatShowDatesText('2026-12-12T00:00:00+00:00', '2026-12-13T00:00:00+00:00')).toBe(
      'Dec 12, 2026 to Dec 13, 2026'
    );
  });

  it('says so when the show has no dates yet', () => {
    expect(formatShowDatesText('', '')).toBe('No dates yet');
  });
});

const mockUseShowTrials = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/queries/useShowTrials', () => ({ useShowTrials: mockUseShowTrials }));

const TRIALS = [
  { id: 'trial-1', name: 'Trial 1', trial_number: '1', trial_date: '2026-12-12' },
  { id: 'trial-2', name: 'Trial 2', trial_number: '2', trial_date: '2026-12-13' },
];

function renderDates(opts: { hasChanges?: boolean; onEditTrial?: (id: string) => void } = {}) {
  const onEditTrial = 'onEditTrial' in opts ? opts.onEditTrial : vi.fn();
  const value = { hasChanges: opts.hasChanges ?? false } as unknown as EditPanelContextValue;
  const result = render(
    <EditPanelContext.Provider value={value}>
      <ShowEditTrialDates
        startDate="2026-12-12T00:00:00+00:00"
        endDate="2026-12-13T00:00:00+00:00"
        showId="show-1"
        onEditTrial={onEditTrial}
      />
    </EditPanelContext.Provider>
  );
  return { ...result, onEditTrial };
}

describe('ShowEditTrialDates', () => {
  beforeEach(() => {
    mockUseShowTrials.mockReturnValue({ data: TRIALS });
  });

  it('shows the dates as text and one Change day button per trial', () => {
    renderDates();
    expect(screen.getByTestId('show-dates-text')).toHaveTextContent('Dec 12, 2026 to Dec 13, 2026');
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: /^Trial 1 · .*Dec 12, 2026 · Change day$/ })
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: /^Trial 2 · .*Dec 13, 2026 · Change day$/ })
    ).toBeVisible();
  });

  it('works with a single trial', () => {
    mockUseShowTrials.mockReturnValue({ data: [TRIALS[0]] });
    renderDates();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('opens Edit Trial for the chosen trial only', async () => {
    const { user, onEditTrial } = renderDates();
    await user.click(screen.getByRole('button', { name: /^Trial 2 / }));
    expect(onEditTrial).toHaveBeenCalledTimes(1);
    expect(onEditTrial).toHaveBeenCalledWith('trial-2');
  });

  it('offers no buttons when the host has no trial dialogs', () => {
    renderDates({ onEditTrial: undefined });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('disables every button with a hint while changes are unsaved', async () => {
    const { user, onEditTrial } = renderDates({ hasChanges: true });
    const buttons = screen.getAllByRole('button');
    for (const button of buttons) expect(button).toBeDisabled();
    expect(screen.getByText(/save or cancel your changes first/i)).toBeInTheDocument();
    await user.click(buttons[0]!);
    expect(onEditTrial).not.toHaveBeenCalled();
  });

  it('shows no hint when nothing is unsaved', () => {
    renderDates();
    expect(screen.queryByText(/save or cancel your changes first/i)).not.toBeInTheDocument();
  });
});

const formData: ShowEditFormData = {
  id: 'show-1',
  name: 'Show',
  status: 'draft',
  organization: 'AKC',
  clubId: 'club-1',
  startDate: '2026-12-12T00:00:00+00:00',
  endDate: '2026-12-13T00:00:00+00:00',
  location: '',
  entryOpenDate: '',
  entryCloseDate: '',
  preEntryFee: '0',
  dayOfShowFee: '0',
  assignedJudges: [],
  acceptCheckPayments: false,
  acceptCashPayments: false,
  style: 'monogram',
};

describe('Show Edit payload', () => {
  it('does not carry the show dates', () => {
    const payload = formDataToShow(formData);
    expect(payload).not.toHaveProperty('startDate');
    expect(payload).not.toHaveProperty('endDate');
  });

  it('does not ask for dates the form no longer edits', () => {
    const result = showSchemas.edit.safeParse({ ...formData, startDate: '', endDate: '' });
    expect(result.success).toBe(true);
  });
});
