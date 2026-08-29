import { render, screen } from '@/test/utils/testUtils';
import { fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUpdateShowData = vi.fn();

vi.mock('@/store/wizardStore', () => ({
  useWizardStore: vi.fn(() => ({
    show: {
      name: '',
      organization: '',
      location: '100 Old Venue Road',
      latitude: 36.15,
      longitude: -95.99,
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
  const useClubStore = Object.assign(
    vi.fn(() => ({
      clubs: [],
      loadClubs: vi.fn().mockResolvedValue(undefined),
      syncClubs: vi.fn(),
    })),
    { getState: () => ({ clubs: [] }) }
  );
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

  it('renders the Fees & Payments heading with Payment Methods folded in', () => {
    render(<ShowDetailsStep />);
    expect(screen.getByText('Fees & Payments')).toBeInTheDocument();
    // The old standalone "Payment Methods" heading is gone — the accept-check /
    // accept-cash checkboxes now live under the Fees & Payments group.
    expect(screen.queryByText('Payment Methods')).not.toBeInTheDocument();
  });

  it('preserves the current wizard route when handing off complete club creation', () => {
    render(<ShowDetailsStep />, {
      initialRoute: '/secretary/create-show/wizard?source=club-handoff',
    });

    expect(screen.getByRole('link', { name: /create new club/i })).toHaveAttribute(
      'href',
      '/clubs?create=true&returnTo=%2Fsecretary%2Fcreate-show%2Fwizard%3Fsource%3Dclub-handoff'
    );
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

  it('keeps Premium List Style and Starting Armband collapsed by default', () => {
    render(<ShowDetailsStep />);
    // Role queries exclude hidden/unmounted nodes, so this holds whether Base UI
    // unmounts the closed panel or just hides it.
    expect(screen.queryByRole('combobox', { name: /premium list style/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('spinbutton', { name: /starting armband number/i })
    ).not.toBeInTheDocument();
  });

  it('reveals Premium List Style (default monogram) + armband after expanding More options', async () => {
    const user = userEvent.setup();
    render(<ShowDetailsStep />);
    await user.click(screen.getByRole('button', { name: /more options/i }));
    const styleCombo = await screen.findByRole('combobox', { name: /premium list style/i });
    expect(styleCombo).toHaveTextContent(/monogram \(default\)/i);
    expect(
      await screen.findByRole('spinbutton', { name: /starting armband number/i })
    ).toBeInTheDocument();
  });

  it('uses single-column field groups on mobile with desktop two-column restoration', () => {
    render(<ShowDetailsStep />);

    const basicGrid = screen.getByLabelText(/show name/i).closest('[class*="grid"]');
    expect(basicGrid?.className).toContain('grid-cols-1');
    expect(basicGrid?.className).toContain('md:grid-cols-2');

    const showDatesGroup = screen.getByText(/show dates/i).closest('div');
    expect(showDatesGroup?.className).toContain('md:col-span-2');

    const entryPeriodGroup = screen.getByText(/entry period/i).closest('div');
    expect(entryPeriodGroup?.className).toContain('md:col-span-2');

    const officialsSection = screen.getByText('Officials').closest('div');
    const officialsGrid = officialsSection?.querySelector('[class*="grid"]');
    expect(officialsGrid?.className).toContain('grid-cols-1');
    expect(officialsGrid?.className).toContain('md:grid-cols-2');
  });
});

describe('ShowDetailsStep — Step-1 grouping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the four always-visible group headings', () => {
    render(<ShowDetailsStep />);
    expect(screen.getByRole('heading', { name: 'Basics' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dates & Entry' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Fees & Payments' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Officials' })).toBeInTheDocument();
  });

  it('invalidates the confirmed venue pin when the address changes', () => {
    render(<ShowDetailsStep />);

    fireEvent.change(screen.getByLabelText(/location/i), {
      target: { value: '200 New Venue Road' },
    });

    expect(mockUpdateShowData).toHaveBeenCalledWith({
      location: '200 New Venue Road',
      latitude: null,
      longitude: null,
    });
  });

  it('folds Host Club into Basics — no standalone Club Information heading', () => {
    render(<ShowDetailsStep />);
    expect(screen.getByText('Host Club')).toBeInTheDocument();
    expect(screen.queryByText('Club Information')).not.toBeInTheDocument();
    // Host Club sits inside the Basics group, alongside the Show Name field.
    const basics = screen.getByRole('heading', { name: 'Basics' }).closest('div');
    expect(basics).not.toBeNull();
    expect(within(basics as HTMLElement).getByText('Host Club')).toBeInTheDocument();
    expect(within(basics as HTMLElement).getByLabelText(/show name/i)).toBeInTheDocument();
  });
});
