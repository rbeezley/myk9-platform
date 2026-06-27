import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { WithdrawalPolicyDisclosure } from '../WithdrawalPolicyDisclosure';
import type { WithdrawalPolicy } from '../withdrawalPolicy';

const mockHook = vi.hoisted(() => vi.fn());
vi.mock('../useEffectiveWithdrawalPolicy', () => ({
  useEffectiveWithdrawalPolicy: (showId: string | null | undefined) => mockHook(showId),
}));

function hookState(over: Partial<{ data: WithdrawalPolicy | null; isLoading: boolean; isError: boolean }>) {
  return { data: null, isLoading: false, isError: false, ...over };
}

describe('WithdrawalPolicyDisclosure', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the described policy line for a resolved policy', () => {
    mockHook.mockReturnValue(
      hookState({
        data: { cutoffDate: '2026-06-01', retentionType: 'flat', retentionValue: 1000, notes: null },
      })
    );
    render(<WithdrawalPolicyDisclosure showId="show-1" />);
    expect(
      screen.getByText(/Full refund of the entry fee until June 1, 2026; after that, \$10\.00 is kept/)
    ).toBeInTheDocument();
    expect(screen.getByText(/Service fees are non-refundable\./)).toBeInTheDocument();
  });

  it('renders the neutral "contact the club" line when no policy is set', () => {
    mockHook.mockReturnValue(hookState({ data: null }));
    render(<WithdrawalPolicyDisclosure showId="show-1" />);
    expect(screen.getByText(/Refund policy: contact the club\./)).toBeInTheDocument();
  });

  it('renders prose notes alongside the line', () => {
    mockHook.mockReturnValue(
      hookState({
        data: {
          cutoffDate: '2026-06-01',
          retentionType: 'flat',
          retentionValue: 1000,
          notes: 'Email the secretary to withdraw.',
        },
      })
    );
    render(<WithdrawalPolicyDisclosure showId="show-1" />);
    expect(screen.getByText('Email the secretary to withdraw.')).toBeInTheDocument();
  });

  it('renders nothing while loading (no flash of the neutral line)', () => {
    mockHook.mockReturnValue(hookState({ isLoading: true }));
    const { container } = render(<WithdrawalPolicyDisclosure showId="show-1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing on error (e.g. columns not yet migrated)', () => {
    mockHook.mockReturnValue(hookState({ isError: true }));
    const { container } = render(<WithdrawalPolicyDisclosure showId="show-1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when no showId is provided', () => {
    mockHook.mockReturnValue(hookState({}));
    const { container } = render(<WithdrawalPolicyDisclosure showId={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
