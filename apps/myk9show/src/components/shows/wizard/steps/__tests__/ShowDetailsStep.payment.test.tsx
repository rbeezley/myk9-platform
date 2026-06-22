import { render, screen } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUpdateShowData = vi.fn();

vi.mock('@/store/wizardStore', () => ({
  useWizardStore: vi.fn(() => ({
    show: {
      name: '',
      organization: '',
      startDate: '',
      endDate: '',
      entryOpenDate: '',
      entryCloseDate: '',
      preEntryFee: 0,
      dayOfShowFee: 0,
      startingArmbandNumber: 100,
      clubId: '',
      officials: { secretary: [], chairman: [], steward: [] },
      judgeIds: [],
      acceptCheckPayments: false,
      acceptCashPayments: false,
      style: 'monogram',
    },
    updateShowData: mockUpdateShowData,
    addJudgeToShow: vi.fn(),
    removeJudgeFromShow: vi.fn(),
    judgeDetails: {},
  })),
}));

vi.mock('@/store/clubStore', () => {
  const useClubStore = vi.fn(() => ({
    clubs: [],
    loadClubs: vi.fn().mockResolvedValue(undefined),
    syncClubs: vi.fn(),
  }));
  useClubStore.getState = () => ({ clubs: [] });
  return { useClubStore };
});

vi.mock('@/store/userStore', () => ({
  useUserStore: vi.fn(() => ({ people: [], loadPeople: vi.fn() })),
}));

vi.mock('@/components/panels/hooks', () => ({
  usePanelManager: vi.fn(() => ({ openPanel: vi.fn() })),
}));

vi.mock('@/hooks/useUserClubIds', () => ({
  useUserClubIds: vi.fn(() => null),
}));

vi.mock('../CloneFromShowCombobox', () => ({
  CloneFromShowCombobox: () => null,
}));

import { ShowDetailsStep } from '../ShowDetailsStep';

describe('ShowDetailsStep — Payment Methods section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the Payment Methods section heading', () => {
    render(<ShowDetailsStep />);
    expect(screen.getByText('Payment Methods')).toBeInTheDocument();
  });

  it('renders "Credit/Debit Card — always enabled" as a locked row', () => {
    render(<ShowDetailsStep />);
    expect(screen.getByText('Credit/Debit Card — always enabled')).toBeInTheDocument();
  });

  it('renders an unchecked Check checkbox', () => {
    render(<ShowDetailsStep />);
    const checkbox = screen.getByRole('checkbox', { name: /check \(pay at show\)/i });
    expect(checkbox).not.toBeChecked();
  });

  it('renders an unchecked Cash checkbox', () => {
    render(<ShowDetailsStep />);
    const checkbox = screen.getByRole('checkbox', { name: /cash \(pay at show\)/i });
    expect(checkbox).not.toBeChecked();
  });

  it('calls updateShowData with acceptCheckPayments: true when Check is toggled on', async () => {
    const user = userEvent.setup();
    render(<ShowDetailsStep />);
    await user.click(screen.getByRole('checkbox', { name: /check \(pay at show\)/i }));
    expect(mockUpdateShowData).toHaveBeenCalledWith({ acceptCheckPayments: true });
  });

  it('calls updateShowData with acceptCashPayments: true when Cash is toggled on', async () => {
    const user = userEvent.setup();
    render(<ShowDetailsStep />);
    await user.click(screen.getByRole('checkbox', { name: /cash \(pay at show\)/i }));
    expect(mockUpdateShowData).toHaveBeenCalledWith({ acceptCashPayments: true });
  });

  it('renders the Premium List Style selector with the default style', () => {
    render(<ShowDetailsStep />);
    expect(screen.getByText('Premium List Style')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /premium list style/i })).toHaveTextContent(
      /monogram \(default\)/i
    );
  });

  it('uses single-column field groups on mobile with desktop two-column restoration', () => {
    render(<ShowDetailsStep />);

    const basicGrid = screen.getByLabelText(/show name/i).closest('[class*="grid"]');
    expect(basicGrid?.className).toContain('grid-cols-1');
    expect(basicGrid?.className).toContain('md:grid-cols-2');

    const showDatesGroup = screen.getByText(/show dates/i).closest('div');
    expect(showDatesGroup?.className).toContain('md:col-span-2');

    const officialsSection = screen.getByText('Show Officials').closest('.relative');
    const officialsGrid = officialsSection?.querySelector('[class*="grid"]');
    expect(officialsGrid?.className).toContain('grid-cols-1');
    expect(officialsGrid?.className).toContain('md:grid-cols-2');
  });
});
