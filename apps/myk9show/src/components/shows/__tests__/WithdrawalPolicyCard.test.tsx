import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { WithdrawalPolicyCard } from '../WithdrawalPolicyCard';

const { mockFrom, mockSingle, mockUpdate, mockUpdateEq } = vi.hoisted(() => {
  const mockSingle = vi.fn();
  const mockEq = vi.fn(() => ({ single: mockSingle }));
  const mockSelect = vi.fn(() => ({ eq: mockEq }));
  const mockUpdateEq = vi.fn();
  const mockUpdate = vi.fn(() => ({ eq: mockUpdateEq }));
  const mockFrom = vi.fn(() => ({ select: mockSelect, update: mockUpdate }));
  return { mockFrom, mockSingle, mockUpdate, mockUpdateEq };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi
        .fn()
        .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  },
}));

function showRow(overrides: Record<string, unknown> = {}) {
  return {
    withdrawal_cutoff_date: null,
    withdrawal_retention_type: null,
    withdrawal_retention_value: null,
    withdrawal_policy_notes: null,
    ...overrides,
  };
}

function clubRow(overrides: Record<string, unknown> = {}) {
  return {
    default_withdrawal_cutoff_date: null,
    default_withdrawal_retention_type: null,
    default_withdrawal_retention_value: null,
    default_withdrawal_policy_notes: null,
    ...overrides,
  };
}

describe('WithdrawalPolicyCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSingle.mockResolvedValue({ data: showRow(), error: null });
    mockUpdateEq.mockResolvedValue({ data: null, error: null });
  });

  it('renders the policy fields', async () => {
    render(<WithdrawalPolicyCard scope="show" entityId="show-1" />);
    await waitFor(() => {
      expect(screen.getByText('Withdrawal Refund Policy')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Full-refund cutoff date')).toBeInTheDocument();
    expect(screen.getByLabelText('Amount kept (USD)')).toBeInTheDocument();
  });

  it('loads a stored flat fee (cents) as a dollar value', async () => {
    mockSingle.mockResolvedValue({
      data: showRow({ withdrawal_retention_type: 'flat', withdrawal_retention_value: 1000 }),
      error: null,
    });
    render(<WithdrawalPolicyCard scope="show" entityId="show-1" />);
    await waitFor(() => {
      const input = screen.getByLabelText('Amount kept (USD)') as HTMLInputElement;
      expect(input.value).toBe('10.00');
    });
  });

  it('MONEY: saves a flat dollar entry as cents (show scope → shows columns)', async () => {
    render(<WithdrawalPolicyCard scope="show" entityId="show-1" />);
    await waitFor(() => screen.getByLabelText('Amount kept (USD)'));

    fireEvent.change(screen.getByLabelText('Amount kept (USD)'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save policy' }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          withdrawal_retention_type: 'flat',
          withdrawal_retention_value: 1000, // $10 stored as cents, not 10
        })
      );
    });
    expect(mockFrom).toHaveBeenCalledWith('shows');
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'show-1');
  });

  it('MONEY: club scope writes the default_withdrawal_* columns on clubs', async () => {
    mockSingle.mockResolvedValue({ data: clubRow(), error: null });
    render(<WithdrawalPolicyCard scope="club" entityId="club-9" />);
    await waitFor(() => screen.getByLabelText('Amount kept (USD)'));

    fireEvent.change(screen.getByLabelText('Amount kept (USD)'), { target: { value: '7.50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save policy' }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          default_withdrawal_retention_type: 'flat',
          default_withdrawal_retention_value: 750,
        })
      );
    });
    expect(mockFrom).toHaveBeenCalledWith('clubs');
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'club-9');
  });

  it('saves a percentage as a raw whole number', async () => {
    mockSingle.mockResolvedValue({
      data: showRow({ withdrawal_retention_type: 'percent', withdrawal_retention_value: 25 }),
      error: null,
    });
    render(<WithdrawalPolicyCard scope="show" entityId="show-1" />);

    await waitFor(() => {
      const input = screen.getByLabelText('Percent kept') as HTMLInputElement;
      expect(input.value).toBe('25');
    });

    fireEvent.change(screen.getByLabelText('Percent kept'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save policy' }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          withdrawal_retention_type: 'percent',
          withdrawal_retention_value: 30, // raw percent, NOT cents
        })
      );
    });
  });

  it('nulls the type+value pair when the retention amount is cleared', async () => {
    mockSingle.mockResolvedValue({
      data: showRow({ withdrawal_retention_type: 'flat', withdrawal_retention_value: 1000 }),
      error: null,
    });
    render(<WithdrawalPolicyCard scope="show" entityId="show-1" />);
    await waitFor(() => {
      const input = screen.getByLabelText('Amount kept (USD)') as HTMLInputElement;
      expect(input.value).toBe('10.00');
    });

    fireEvent.change(screen.getByLabelText('Amount kept (USD)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save policy' }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          withdrawal_retention_type: null,
          withdrawal_retention_value: null,
        })
      );
    });
  });

  it('saves the cutoff date and nulls an empty one', async () => {
    render(<WithdrawalPolicyCard scope="show" entityId="show-1" />);
    await waitFor(() => screen.getByLabelText('Full-refund cutoff date'));

    fireEvent.change(screen.getByLabelText('Full-refund cutoff date'), {
      target: { value: '2026-06-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save policy' }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ withdrawal_cutoff_date: '2026-06-01' })
      );
    });
  });
});
