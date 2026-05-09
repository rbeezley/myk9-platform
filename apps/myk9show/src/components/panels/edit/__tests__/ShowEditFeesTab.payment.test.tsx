import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/components/ui/tabs', () => import('../../../common/__tests__/mockTabs'));

import { ShowEditFeesTab } from '../ShowEditFeesTab';
import type { ShowEditFormData } from '../ShowEditPanel.types';

const baseData: ShowEditFormData = {
  name: 'Test Show',
  status: 'draft',
  organization: 'AKC',
  clubId: 'c1',
  startDate: '2026-05-01',
  endDate: '2026-05-02',
  location: 'Dogtown',
  entryOpenDate: '2026-04-01',
  entryCloseDate: '2026-04-15',
  preEntryFee: '15',
  dayOfShowFee: '20',
  assignedJudges: [],
  acceptCheckPayments: false,
  acceptCashPayments: false,
  style: 'monogram',
};

describe('ShowEditFeesTab — Payment Methods section', () => {
  it('renders the Payment Methods heading', () => {
    render(
      <ShowEditFeesTab
        data={baseData}
        handleInputChange={vi.fn(() => vi.fn())}
        handleCheckboxChange={vi.fn(() => vi.fn())}
      />
    );
    expect(screen.getByText('Payment Methods')).toBeInTheDocument();
  });

  it('renders "Credit/Debit Card — always enabled" row', () => {
    render(
      <ShowEditFeesTab
        data={baseData}
        handleInputChange={vi.fn(() => vi.fn())}
        handleCheckboxChange={vi.fn(() => vi.fn())}
      />
    );
    expect(screen.getByText('Credit/Debit Card — always enabled')).toBeInTheDocument();
  });

  it('renders Check checkbox unchecked when acceptCheckPayments is false', () => {
    render(
      <ShowEditFeesTab
        data={baseData}
        handleInputChange={vi.fn(() => vi.fn())}
        handleCheckboxChange={vi.fn(() => vi.fn())}
      />
    );
    expect(screen.getByRole('checkbox', { name: /check \(pay at show\)/i })).not.toBeChecked();
  });

  it('renders Check checkbox checked when acceptCheckPayments is true', () => {
    render(
      <ShowEditFeesTab
        data={{ ...baseData, acceptCheckPayments: true }}
        handleInputChange={vi.fn(() => vi.fn())}
        handleCheckboxChange={vi.fn(() => vi.fn())}
      />
    );
    expect(screen.getByRole('checkbox', { name: /check \(pay at show\)/i })).toBeChecked();
  });

  it('calls handleCheckboxChange("acceptCheckPayments") when Check is toggled', async () => {
    const user = userEvent.setup();
    const mockHandleCheckboxChange = vi.fn(() => vi.fn());
    render(
      <ShowEditFeesTab
        data={baseData}
        handleInputChange={vi.fn(() => vi.fn())}
        handleCheckboxChange={mockHandleCheckboxChange}
      />
    );
    await user.click(screen.getByRole('checkbox', { name: /check \(pay at show\)/i }));
    expect(mockHandleCheckboxChange).toHaveBeenCalledWith('acceptCheckPayments');
  });

  it('calls handleCheckboxChange("acceptCashPayments") when Cash is toggled', async () => {
    const user = userEvent.setup();
    const mockHandleCheckboxChange = vi.fn(() => vi.fn());
    render(
      <ShowEditFeesTab
        data={baseData}
        handleInputChange={vi.fn(() => vi.fn())}
        handleCheckboxChange={mockHandleCheckboxChange}
      />
    );
    await user.click(screen.getByRole('checkbox', { name: /cash \(pay at show\)/i }));
    expect(mockHandleCheckboxChange).toHaveBeenCalledWith('acceptCashPayments');
  });
});
