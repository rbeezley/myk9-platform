import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import ShowInformationCard, { type ShowFormData } from '../ShowInformationCard';

function makeShowData(overrides: Partial<ShowFormData> = {}): ShowFormData {
  return {
    name: 'Heartland Scent Work Trial',
    status: 'draft',
    type: 'Scent Work',
    clubId: 'club-1',
    startDate: '2026-08-01',
    endDate: '2026-08-03',
    entryOpenDate: '2026-06-01',
    entryCloseDate: '2026-07-15',
    preEntryFee: '30',
    dayOfShowFee: '35',
    assignedJudges: [],
    ...overrides,
  };
}

describe('ShowInformationCard', () => {
  it('renders date-only fields through the shared long date formatter', () => {
    render(
      <ShowInformationCard
        showData={makeShowData()}
        handleEditShow={vi.fn()}
        setShowDeleteDialog={vi.fn()}
      />
    );

    expect(screen.getByText('Saturday, August 1, 2026')).toBeInTheDocument();
    expect(screen.getByText('Monday, August 3, 2026')).toBeInTheDocument();
    expect(screen.getByText('Monday, June 1, 2026')).toBeInTheDocument();
    expect(screen.getByText('Wednesday, July 15, 2026')).toBeInTheDocument();
  });
});
