import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { WithdrawalPolicyCard, inputToStored } from '../WithdrawalPolicyCard';

const { mockFrom, mockSingle, mockUpdate, mockUpdateEq } = vi.hoisted(() => {
  const mockSingle = vi.fn();
  const mockEq = vi.fn(() => ({ single: mockSingle }));
  const mockSelect = vi.fn(() => ({ eq: mockEq }));
  const mockUpdateEq = vi.fn();
  const mockUpdate = vi.fn(() => ({ eq: mockUpdateEq }));
  const mockFrom = vi.fn((_table?: string) => ({ select: mockSelect, update: mockUpdate }));
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

  // MYK9-454. The cutoff is an absolute calendar date, so it is meaningful only
  // against ONE show's entry-close date. Offered as a club-wide default it
  // governed every future show and, once past, silently kept the office fee on
  // all of them. Club scope must neither ask for it nor write it.
  it('club scope has no cutoff date field, while show scope keeps one', async () => {
    mockSingle.mockResolvedValue({ data: clubRow(), error: null });
    const { unmount } = render(<WithdrawalPolicyCard scope="club" entityId="club-9" />);
    await waitFor(() => screen.getByLabelText('Amount kept (USD)'));
    expect(screen.queryByLabelText('Full-refund cutoff date')).not.toBeInTheDocument();
    unmount();

    // Positive control: the same assertion on the scope that must still have it.
    mockSingle.mockResolvedValue({ data: showRow(), error: null });
    render(<WithdrawalPolicyCard scope="show" entityId="show-1" />);
    await waitFor(() => screen.getByLabelText('Full-refund cutoff date'));
  });

  it('MONEY: a club save never writes a cutoff column', async () => {
    mockSingle.mockResolvedValue({ data: clubRow(), error: null });
    render(<WithdrawalPolicyCard scope="club" entityId="club-9" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save policy' })).toBeEnabled());

    fireEvent.change(screen.getByLabelText('Amount kept (USD)'), { target: { value: '7.50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save policy' }));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    // The mock is declared with no parameters, so its recorded args type is [].
    const calls = mockUpdate.mock.calls as unknown as Array<[Record<string, unknown>]>;
    const payload = calls[0]![0];
    expect(Object.keys(payload)).not.toContain('default_withdrawal_cutoff_date');
    expect(Object.keys(payload).some(k => k.includes('cutoff'))).toBe(false);
  });

  // MYK9-454 / Codex review of #2156. Once the levels compose per field, BLANK
  // means "inherit the club fee" and only an explicit 0 means "refund in full".
  // The helper text says exactly that, so pin the behaviour it promises: a typed
  // 0 must reach the row as a declared retention, not as null (which would read
  // as undeclared and inherit).
  it('MONEY: an explicit 0 is saved as a declared retention, not as blank', async () => {
    render(<WithdrawalPolicyCard scope="show" entityId="show-1" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save policy' })).toBeEnabled());

    fireEvent.change(screen.getByLabelText('Amount kept (USD)'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save policy' }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          withdrawal_retention_type: 'flat',
          withdrawal_retention_value: 0,
        })
      );
    });
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

// Adversarial review of #2156. A non-finite parse reaches the row as
// {type:'flat', value:null} — JSON.stringify(Infinity) is null — and such a row
// reads as a DECLARED retention, which suppresses the club fee this branch
// exists to preserve. jsdom's number input refuses to hold '1e999', so the
// guard is tested where it lives rather than through the component.
// Adversarial review round 4. `isLoading` is `isPending && isFetching`, so it
// is FALSE once a load errors — the earlier guard left a blank, editable form
// whose Save wrote nulls over the club default every show now inherits.
describe('WithdrawalPolicyCard — failed load', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateEq.mockResolvedValue({ data: null, error: null });
  });

  it('MONEY: cannot save over a policy it failed to load', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    render(<WithdrawalPolicyCard scope="club" entityId="club-9" />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Save policy' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Save policy' }));
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe('inputToStored', () => {
  it('MONEY: treats a non-finite amount as blank, not as a declared value', () => {
    expect(inputToStored('flat', '1e999')).toBeNull();
    expect(inputToStored('flat', 'Infinity')).toBeNull();
    expect(inputToStored('flat', '-Infinity')).toBeNull();
  });

  it('still parses ordinary amounts, including an explicit zero', () => {
    expect(inputToStored('flat', '10')).toBe(1000);
    expect(inputToStored('flat', '7.50')).toBe(750);
    expect(inputToStored('flat', '0')).toBe(0);
    expect(inputToStored('percent', '25')).toBe(25);
  });

  it('treats blank and unparseable text as undeclared', () => {
    expect(inputToStored('flat', '')).toBeNull();
    expect(inputToStored('flat', '   ')).toBeNull();
    expect(inputToStored('flat', 'abc')).toBeNull();
  });
});
