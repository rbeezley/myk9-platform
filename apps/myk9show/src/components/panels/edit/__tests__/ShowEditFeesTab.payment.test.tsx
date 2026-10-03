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
  it('shows the saved junior handler fee beside the regular fees', () => {
    render(
      <ShowEditFeesTab
        data={{ ...baseData, juniorHandlerFee: '15' }}
        handleCheckboxChange={vi.fn(() => vi.fn())}
      />
    );
    expect(screen.getByLabelText('Junior Handler Fee')).toHaveValue('15.00');
  });
  it('hides the unused junior rate for ASCA shows', () => {
    render(
      <ShowEditFeesTab
        data={{ ...baseData, organization: 'ASCA', juniorHandlerFee: '15' }}
        handleCheckboxChange={vi.fn(() => vi.fn())}
      />
    );
    expect(screen.queryByLabelText('Junior Handler Fee')).not.toBeInTheDocument();
  });
  it('renders the Payment Methods heading', () => {
    render(<ShowEditFeesTab data={baseData} handleCheckboxChange={vi.fn(() => vi.fn())} />);
    expect(screen.getByText('Payment Methods')).toBeInTheDocument();
  });

  // MYK9-979: the same switch as the wizard, bound to onlineEntriesEnabled.
  it('renders the "Accept online entries" switch from the saved value', () => {
    render(
      <ShowEditFeesTab
        data={{ ...baseData, onlineEntriesEnabled: true }}
        handleCheckboxChange={vi.fn(() => vi.fn())}
      />
    );
    expect(screen.getByRole('switch', { name: /accept online entries/i })).toBeChecked();
  });

  it('turning the switch off writes onlineEntriesEnabled: false', async () => {
    const setter = vi.fn();
    const handleCheckboxChange = vi.fn(() => setter);
    const user = userEvent.setup();
    render(
      <ShowEditFeesTab
        data={{ ...baseData, onlineEntriesEnabled: true }}
        handleCheckboxChange={handleCheckboxChange}
      />
    );
    await user.click(screen.getByRole('switch', { name: /accept online entries/i }));
    expect(handleCheckboxChange).toHaveBeenCalledWith('onlineEntriesEnabled');
    expect(setter).toHaveBeenCalledWith(false);
  });

  it('renders Check checkbox unchecked when acceptCheckPayments is false', () => {
    render(<ShowEditFeesTab data={baseData} handleCheckboxChange={vi.fn(() => vi.fn())} />);
    expect(screen.getByRole('checkbox', { name: /check \(pay at show\)/i })).not.toBeChecked();
  });

  it('renders Check checkbox checked when acceptCheckPayments is true', () => {
    render(
      <ShowEditFeesTab
        data={{ ...baseData, acceptCheckPayments: true }}
        handleCheckboxChange={vi.fn(() => vi.fn())}
      />
    );
    expect(screen.getByRole('checkbox', { name: /check \(pay at show\)/i })).toBeChecked();
  });

  it('calls handleCheckboxChange("acceptCheckPayments") when Check is toggled', async () => {
    const user = userEvent.setup();
    const mockHandleCheckboxChange = vi.fn(() => vi.fn());
    render(<ShowEditFeesTab data={baseData} handleCheckboxChange={mockHandleCheckboxChange} />);
    await user.click(screen.getByRole('checkbox', { name: /check \(pay at show\)/i }));
    expect(mockHandleCheckboxChange).toHaveBeenCalledWith('acceptCheckPayments');
  });

  it('calls handleCheckboxChange("acceptCashPayments") when Cash is toggled', async () => {
    const user = userEvent.setup();
    const mockHandleCheckboxChange = vi.fn(() => vi.fn());
    render(<ShowEditFeesTab data={baseData} handleCheckboxChange={mockHandleCheckboxChange} />);
    await user.click(screen.getByRole('checkbox', { name: /cash \(pay at show\)/i }));
    expect(mockHandleCheckboxChange).toHaveBeenCalledWith('acceptCashPayments');
  });
});

describe('ShowEditFeesTab — fee labels', () => {
  it('names the fees "Pre-Entry Fee" and "Day-of-Show Fee"', () => {
    render(<ShowEditFeesTab data={baseData} handleCheckboxChange={vi.fn(() => vi.fn())} />);
    expect(screen.getByLabelText('Pre-Entry Fee')).toBeInTheDocument();
    expect(screen.getByLabelText('Day-of-Show Fee')).toBeInTheDocument();
  });
});
