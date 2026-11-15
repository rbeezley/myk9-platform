/**
 * MYK9-1976: the policy text inside the Withdrawal policy card. A default the club can edit
 * and go back to, a show's text over the club's, and a plain note when the words and the
 * fields that drive the suggested refund could disagree.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { WithdrawalPolicyCard } from '../WithdrawalPolicyCard';
import { buildDefaultWithdrawalPolicyText } from '@/features/payments/withdrawalPolicyText';

const { mockFrom, mockSelect, mockSingle, mockUpdate, mockUpdateEq } = vi.hoisted(() => {
  const mockSingle = vi.fn();
  const mockEq = vi.fn(() => ({ single: mockSingle }));
  const mockSelect = vi.fn((_columns?: string) => ({ eq: mockEq }));
  const mockUpdateEq = vi.fn();
  const mockUpdate = vi.fn((_payload?: unknown) => ({ eq: mockUpdateEq }));
  const mockFrom = vi.fn((_table?: string) => ({ select: mockSelect, update: mockUpdate }));
  return { mockFrom, mockSelect, mockSingle, mockUpdate, mockUpdateEq };
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

function showRow(overrides: Record<string, unknown> = {}, club: Record<string, unknown> = {}) {
  return {
    withdrawal_cutoff_date: null,
    withdrawal_retention_type: null,
    withdrawal_retention_value: null,
    withdrawal_policy_notes: null,
    withdrawal_policy_text: null,
    pre_entry_fee: 30,
    trials: [{ registry_id: 'ASCA' }],
    clubs: {
      default_withdrawal_retention_type: null,
      default_withdrawal_retention_value: null,
      default_withdrawal_policy_notes: null,
      default_withdrawal_policy_text: null,
      ...club,
    },
    ...overrides,
  };
}

function clubRow(overrides: Record<string, unknown> = {}) {
  return {
    default_withdrawal_retention_type: null,
    default_withdrawal_retention_value: null,
    default_withdrawal_policy_notes: null,
    default_withdrawal_policy_text: null,
    ...overrides,
  };
}

const textBox = () => screen.getByLabelText('Policy text exhibitors read') as HTMLTextAreaElement;
const lastPayload = () =>
  mockUpdate.mock.calls[mockUpdate.mock.calls.length - 1]?.[0] as Record<string, unknown>;

async function loaded() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save policy' })).toBeEnabled());
}

describe('WithdrawalPolicyCard policy text (MYK9-1976)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateEq.mockResolvedValue({ data: null, error: null });
  });

  it("show scope: reads the show's registry, fee and the club's text in its one read", async () => {
    mockSingle.mockResolvedValue({ data: showRow(), error: null });
    render(<WithdrawalPolicyCard scope="show" entityId="show-1" />);
    await loaded();
    const columns = String(mockSelect.mock.calls[0]?.[0] ?? '');
    expect(columns).toMatch(/\bwithdrawal_policy_text\b/);
    expect(columns).toMatch(/\bpre_entry_fee\b/);
    expect(columns).toMatch(/trials \( registry_id \)/);
    expect(columns).toMatch(/\bdefault_withdrawal_policy_text\b/);
  });

  it('a new show starts with the default for its registry, and saving it stores NULL (follow the default)', async () => {
    mockSingle.mockResolvedValue({ data: showRow(), error: null });
    render(<WithdrawalPolicyCard scope="show" entityId="show-1" />);
    await loaded();
    expect(textBox().value).toBe(buildDefaultWithdrawalPolicyText(null, 'ASCA'));
    expect(textBox().value).toContain('the ASCA rules cover: judge change.');
    expect(screen.queryByRole('button', { name: 'Use the default text' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Save policy' }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(lastPayload()).toEqual(expect.objectContaining({ withdrawal_policy_text: null }));
  });

  it('the default follows the fields as they are edited', async () => {
    mockSingle.mockResolvedValue({ data: showRow(), error: null });
    render(<WithdrawalPolicyCard scope="show" entityId="show-1" />);
    await loaded();
    fireEvent.change(screen.getByLabelText('Full-refund cutoff date'), {
      target: { value: '2026-06-01' },
    });
    fireEvent.change(screen.getByLabelText('Amount kept (USD)'), { target: { value: '10' } });
    expect(textBox().value).toContain(
      'Full refund of the entry fee until June 1, 2026; after that, $10.00 is kept.'
    );
  });

  it('the club edits its text and saves it, line breaks kept, on the clubs column', async () => {
    mockSingle.mockResolvedValue({ data: clubRow(), error: null });
    render(<WithdrawalPolicyCard scope="club" entityId="club-9" />);
    await loaded();
    expect(textBox().value).toBe(buildDefaultWithdrawalPolicyText(null, null));

    fireEvent.change(textBox(), { target: { value: 'Our policy.\nSecond line.  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save policy' }));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(mockFrom).toHaveBeenCalledWith('clubs');
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'club-9');
    expect(lastPayload()).toEqual(
      expect.objectContaining({ default_withdrawal_policy_text: 'Our policy.\nSecond line.' })
    );
  });

  it('a text typed back to exactly the default is not stored as the club’s own', async () => {
    mockSingle.mockResolvedValue({ data: clubRow(), error: null });
    render(<WithdrawalPolicyCard scope="club" entityId="club-9" />);
    await loaded();
    const defaultText = textBox().value;
    fireEvent.change(textBox(), { target: { value: 'Something else.' } });
    fireEvent.change(textBox(), { target: { value: defaultText } });
    fireEvent.click(screen.getByRole('button', { name: 'Save policy' }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(lastPayload()).toEqual(
      expect.objectContaining({ default_withdrawal_policy_text: null })
    );
  });

  it('"Use the default text" goes back to the default and saves NULL', async () => {
    mockSingle.mockResolvedValue({
      data: clubRow({ default_withdrawal_policy_text: 'Our old words.' }),
      error: null,
    });
    render(<WithdrawalPolicyCard scope="club" entityId="club-9" />);
    await loaded();
    expect(textBox().value).toBe('Our old words.');

    fireEvent.click(screen.getByRole('button', { name: 'Use the default text' }));
    expect(textBox().value).toBe(buildDefaultWithdrawalPolicyText(null, null));
    fireEvent.click(screen.getByRole('button', { name: 'Save policy' }));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(lastPayload()).toEqual(
      expect.objectContaining({ default_withdrawal_policy_text: null })
    );
  });

  it("a show with no text of its own shows the club's text, and can go back to it", async () => {
    mockSingle.mockResolvedValue({
      data: showRow({}, { default_withdrawal_policy_text: 'Club words.' }),
      error: null,
    });
    render(<WithdrawalPolicyCard scope="show" entityId="show-1" />);
    await loaded();
    expect(textBox().value).toBe('Club words.');
    expect(screen.getByText(/Using the club’s text/)).toBeInTheDocument();

    fireEvent.change(textBox(), { target: { value: 'Show words.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use the club’s text' }));
    expect(textBox().value).toBe('Club words.');
  });

  it("the show's own text wins over the club's", async () => {
    mockSingle.mockResolvedValue({
      data: showRow(
        { withdrawal_policy_text: 'Show words.' },
        { default_withdrawal_policy_text: 'Club words.' }
      ),
      error: null,
    });
    render(<WithdrawalPolicyCard scope="show" entityId="show-1" />);
    await loaded();
    expect(textBox().value).toBe('Show words.');
  });

  it('MONEY: a text edit leaves the fields the refund is computed from untouched', async () => {
    mockSingle.mockResolvedValue({
      data: showRow({
        withdrawal_cutoff_date: '2026-06-01',
        withdrawal_retention_type: 'flat',
        withdrawal_retention_value: 1000,
      }),
      error: null,
    });
    render(<WithdrawalPolicyCard scope="show" entityId="show-1" />);
    await loaded();
    fireEvent.change(textBox(), { target: { value: 'No refunds.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save policy' }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(lastPayload()).toEqual({
      withdrawal_cutoff_date: '2026-06-01',
      withdrawal_retention_type: 'flat',
      withdrawal_retention_value: 1000,
      withdrawal_policy_notes: null,
      withdrawal_policy_text: 'No refunds.',
    });
  });

  it('says plainly when the text says no refunds but the amount kept is less than the fee', async () => {
    mockSingle.mockResolvedValue({
      data: clubRow({
        default_withdrawal_retention_type: 'flat',
        default_withdrawal_retention_value: 1000,
      }),
      error: null,
    });
    render(<WithdrawalPolicyCard scope="club" entityId="club-9" />);
    await loaded();
    expect(screen.queryByTestId('withdrawal-policy-text-conflict')).toBeNull();

    fireEvent.change(textBox(), { target: { value: 'No refunds after entering.' } });
    expect(screen.getByTestId('withdrawal-policy-text-conflict')).toHaveTextContent(
      /says there are no refunds, but the amount kept above is less than the entry fee/
    );

    fireEvent.change(screen.getByLabelText('Amount kept (USD)'), { target: { value: '' } });
    expect(screen.queryByTestId('withdrawal-policy-text-conflict')).toBeNull();
  });

  it("notes a club's inherited text that says no refunds against this show's full-refund cutoff", async () => {
    mockSingle.mockResolvedValue({
      data: showRow(
        { withdrawal_cutoff_date: '2026-06-01' },
        { default_withdrawal_policy_text: 'Entries are non-refundable.' }
      ),
      error: null,
    });
    render(<WithdrawalPolicyCard scope="show" entityId="show-1" />);
    await loaded();
    expect(screen.getByTestId('withdrawal-policy-text-conflict')).toHaveTextContent(
      /full refund for a withdrawal on or before June 1, 2026/
    );
  });

  it('warns before a link is sent when long policy notes make the default too long for the payment page', async () => {
    mockSingle.mockResolvedValue({ data: showRow(), error: null });
    render(<WithdrawalPolicyCard scope="show" entityId="show-1" />);
    await loaded();
    expect(screen.queryByTestId('withdrawal-policy-too-long')).toBeNull();

    fireEvent.change(screen.getByLabelText('Policy notes (optional)'), {
      target: { value: 'Long note. '.repeat(100) },
    });
    expect(screen.getByTestId('withdrawal-policy-too-long')).toHaveTextContent(
      'The refund policy is too long for the payment page. Shorten the policy notes or the policy text on the Withdrawal policy card, then try again.'
    );
    // Nothing is cut: the box still holds every word of the default.
    expect(textBox().value).toContain('Long note. '.repeat(99).trim());
    expect(textBox().value).toContain('Pull: the dog does not run');
  });
});
