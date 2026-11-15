import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { WithdrawalPolicyDisclosure } from '../WithdrawalPolicyDisclosure';

const { mockFrom, mockSelect, mockSingle } = vi.hoisted(() => {
  const mockSingle = vi.fn();
  const mockEq = vi.fn(() => ({ single: mockSingle }));
  const mockSelect = vi.fn((_columns?: string) => ({ eq: mockEq }));
  const mockFrom = vi.fn((_table?: string) => ({ select: mockSelect }));
  return { mockFrom, mockSelect, mockSingle };
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
    trials: [{ registry_id: 'AKC' }],
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

async function policyText(): Promise<string> {
  const block = await screen.findByTestId('withdrawal-policy-text');
  return block.textContent ?? '';
}

describe('WithdrawalPolicyDisclosure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads the show and club text columns and the show registry in the one show read', async () => {
    mockSingle.mockResolvedValue({ data: showRow(), error: null });
    render(<WithdrawalPolicyDisclosure showId="show-1" />);
    await policyText();
    expect(mockFrom).toHaveBeenCalledWith('shows');
    const columns = String(mockSelect.mock.calls[0]?.[0] ?? '');
    expect(columns).toMatch(/\bwithdrawal_policy_text\b/);
    expect(columns).toMatch(/\bdefault_withdrawal_policy_text\b/);
    expect(columns).toMatch(/trials \( registry_id \)/);
  });

  it("prints the club's text when the show has none", async () => {
    mockSingle.mockResolvedValue({
      data: showRow({}, { default_withdrawal_policy_text: 'Heartland club policy.\nLine two.' }),
      error: null,
    });
    render(<WithdrawalPolicyDisclosure showId="show-1" />);
    expect(await policyText()).toBe('Heartland club policy.\nLine two.');
  });

  it("prints the show's own text over the club's", async () => {
    mockSingle.mockResolvedValue({
      data: showRow(
        { withdrawal_policy_text: 'This show only.' },
        { default_withdrawal_policy_text: 'Club text.' }
      ),
      error: null,
    });
    render(<WithdrawalPolicyDisclosure showId="show-1" />);
    expect(await policyText()).toBe('This show only.');
  });

  it("prints the default for the show's registry when neither wrote one", async () => {
    mockSingle.mockResolvedValue({
      data: showRow({
        withdrawal_cutoff_date: '2026-06-01',
        withdrawal_retention_type: 'flat',
        withdrawal_retention_value: 1000,
        trials: [{ registry_id: 'ASCA' }],
      }),
      error: null,
    });
    render(<WithdrawalPolicyDisclosure showId="show-1" />);
    const text = await policyText();
    expect(text).toContain(
      'Full refund of the entry fee until June 1, 2026; after that, $10.00 is kept.'
    );
    expect(text).toContain('the ASCA rules cover: judge change.');
    expect(text).not.toContain('in season');
    expect(text).toContain("Refunds for a pull are at the club's discretion.");
  });

  it('shows typed markup as text, never as HTML', async () => {
    mockSingle.mockResolvedValue({
      data: showRow({ withdrawal_policy_text: 'Refunds & <b>credits</b>' }),
      error: null,
    });
    const { container } = render(<WithdrawalPolicyDisclosure showId="show-1" />);
    expect(await policyText()).toBe('Refunds & credits');
    expect(container.querySelector('b')).toBeNull();
  });

  it('renders nothing on error (e.g. columns not yet migrated)', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'column does not exist' } });
    const { container } = render(<WithdrawalPolicyDisclosure showId="show-1" />);
    await waitFor(() => expect(mockSingle).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while loading and when no showId is provided', () => {
    mockSingle.mockReturnValue(new Promise(() => {}));
    const { container, unmount } = render(<WithdrawalPolicyDisclosure showId="show-1" />);
    expect(container).toBeEmptyDOMElement();
    unmount();
    const none = render(<WithdrawalPolicyDisclosure showId={null} />);
    expect(none.container).toBeEmptyDOMElement();
  });
});
