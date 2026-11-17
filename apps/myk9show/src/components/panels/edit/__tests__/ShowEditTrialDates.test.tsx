import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ShowEditTrialDates } from '../ShowEditTrialDates';
import { formatShowDatesText } from '../formatShowDatesText';
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

describe('ShowEditTrialDates', () => {
  it('shows the dates as text and links to the show page where trials are edited', async () => {
    const onNavigate = vi.fn();
    const { user } = render(
      <ShowEditTrialDates
        startDate="2026-12-12T00:00:00+00:00"
        endDate="2026-12-13T00:00:00+00:00"
        showId="show-1"
        onNavigate={onNavigate}
      />
    );
    expect(screen.getByTestId('show-dates-text')).toHaveTextContent('Dec 12, 2026 to Dec 13, 2026');
    const link = screen.getByRole('link', { name: /change a trial.s day/i });
    expect(link).toHaveAttribute('href', '/shows/show-1');
    await user.click(link);
    expect(onNavigate).toHaveBeenCalledTimes(1);
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
