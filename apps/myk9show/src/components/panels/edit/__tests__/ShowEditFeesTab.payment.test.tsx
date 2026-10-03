import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/components/ui/tabs', () => import('../../../common/__tests__/mockTabs'));

const onlineSwitch = vi.hoisted(() => ({
  value: undefined as boolean | undefined,
  pending: false,
  offline: false,
  setEnabled: vi.fn(async () => {}),
}));
vi.mock('@/features/payments/useOnlineEntriesSwitch', () => ({
  useOnlineEntriesSwitch: () => onlineSwitch,
}));

import { ShowEditFeesTab } from '../ShowEditFeesTab';
import type { ShowEditFormData } from '../ShowEditPanel.types';
import {
  ONLINE_ENTRIES_OFFLINE_HINT,
  ONLINE_ENTRIES_UNKNOWN_HINT,
} from '@/features/payments/onlineEntryGate';

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

  // MYK9-979 (Codex round 3 on #2707): the switch saves itself. It shows the
  // live value from useOnlineEntriesSwitch, never form data, and flipping it
  // calls the hook, never the form's change handler.
  it('renders the "Accept online entries" switch from the live value', () => {
    onlineSwitch.value = true;
    render(<ShowEditFeesTab data={baseData} handleCheckboxChange={vi.fn(() => vi.fn())} />);
    expect(screen.getByRole('switch', { name: /accept online entries/i })).toBeChecked();
  });

  it('disables the switch with a hint while the value is unknown', () => {
    onlineSwitch.value = undefined;
    render(<ShowEditFeesTab data={baseData} handleCheckboxChange={vi.fn(() => vi.fn())} />);
    const toggle = screen.getByRole('switch', { name: /accept online entries/i });
    expect(toggle).toHaveAttribute('aria-disabled', 'true');
    expect(toggle).toHaveAccessibleDescription(ONLINE_ENTRIES_UNKNOWN_HINT);
  });

  it('disables the switch with a hint while offline (it saves through an online RPC)', () => {
    onlineSwitch.value = true;
    onlineSwitch.offline = true;
    render(<ShowEditFeesTab data={baseData} handleCheckboxChange={vi.fn(() => vi.fn())} />);
    const toggle = screen.getByRole('switch', { name: /accept online entries/i });
    expect(toggle).toHaveAttribute('aria-disabled', 'true');
    expect(toggle).toHaveAccessibleDescription(ONLINE_ENTRIES_OFFLINE_HINT);
    onlineSwitch.offline = false;
  });

  it('flipping the switch saves it on its own and never touches the form', async () => {
    onlineSwitch.value = true;
    const handleCheckboxChange = vi.fn(() => vi.fn());
    const user = userEvent.setup();
    render(<ShowEditFeesTab data={baseData} handleCheckboxChange={handleCheckboxChange} />);
    await user.click(screen.getByRole('switch', { name: /accept online entries/i }));
    expect(onlineSwitch.setEnabled).toHaveBeenCalledWith(false);
    expect(handleCheckboxChange).not.toHaveBeenCalledWith('onlineEntriesEnabled');
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
