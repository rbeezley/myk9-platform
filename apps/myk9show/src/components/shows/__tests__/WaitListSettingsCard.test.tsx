import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { render } from '@/test/utils/testUtils';
import { WaitListSettingsCard } from '../WaitListSettingsCard';

// ---------------------------------------------------------------------------
// Supabase mock (vi.hoisted ensures the factory runs before vi.mock hoisting)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    default_judge_day_capacity: 125,
    mail_in_strategy: 'none',
    mail_in_value: null,
    mail_in_deadline: null,
    mail_in_auto_release: false,
    mail_in_release_date: null,
    waitlist_payment_deadline_hours: 48,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WaitListSettingsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: query returns a show row
    mockSingle.mockResolvedValue({ data: makeRow(), error: null });
    // Default: update succeeds
    mockUpdateEq.mockResolvedValue({ data: null, error: null });
  });

  it('renders capacity input with value 125 when loaded', async () => {
    render(<WaitListSettingsCard showId="show-1" />);

    await waitFor(() => {
      const input = screen.getByLabelText('Judge Daily Capacity') as HTMLInputElement;
      expect(input.value).toBe('125');
    });
  });

  it('shows "Reserved Spots" input when strategy is fixed', async () => {
    mockSingle.mockResolvedValue({
      data: makeRow({ mail_in_strategy: 'fixed', mail_in_value: 10 }),
      error: null,
    });

    render(<WaitListSettingsCard showId="show-1" />);

    await waitFor(() => {
      expect(screen.getByLabelText('Reserved Spots')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Reserved Percentage')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Mail-In Deadline')).not.toBeInTheDocument();
  });

  it('shows "Reserved Percentage" input when strategy is percentage', async () => {
    mockSingle.mockResolvedValue({
      data: makeRow({ mail_in_strategy: 'percentage', mail_in_value: 20 }),
      error: null,
    });

    render(<WaitListSettingsCard showId="show-1" />);

    await waitFor(() => {
      expect(screen.getByLabelText('Reserved Percentage')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Reserved Spots')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Mail-In Deadline')).not.toBeInTheDocument();
  });

  it('shows "Mail-In Deadline" input when strategy is deadline', async () => {
    mockSingle.mockResolvedValue({
      data: makeRow({ mail_in_strategy: 'deadline', mail_in_deadline: '2026-05-01' }),
      error: null,
    });

    render(<WaitListSettingsCard showId="show-1" />);

    await waitFor(() => {
      expect(screen.getByLabelText('Mail-In Deadline')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Reserved Spots')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Reserved Percentage')).not.toBeInTheDocument();
  });

  it('Save button submits updated config', async () => {
    render(<WaitListSettingsCard showId="show-1" />);

    // Wait for data to load
    await waitFor(() => {
      const input = screen.getByLabelText('Judge Daily Capacity') as HTMLInputElement;
      expect(input.value).toBe('125');
    });

    // Change the capacity
    const capacityInput = screen.getByLabelText('Judge Daily Capacity');
    fireEvent.change(capacityInput, { target: { value: '150' } });

    // Click save
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ default_judge_day_capacity: 150 })
      );
      expect(mockUpdateEq).toHaveBeenCalledWith('id', 'show-1');
    });
  });
});
