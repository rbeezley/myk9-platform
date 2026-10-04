import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render, createTestQueryClient } from '@/test/utils/testUtils';
import { judgeDayCapacityKey } from '@/hooks/queries/useJudgeDayCapacity';
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
    waitlist_auto_offer: true,
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

  // The Waitlist tab's Full / spots-available cards derive from these settings (Codex review of #2735).
  it('a successful save refreshes the judge-day capacity cards', async () => {
    mockUpdateEq.mockResolvedValue({ error: null });
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    render(<WaitListSettingsCard showId="show-1" />, { queryClient });
    await waitFor(() =>
      expect((screen.getByLabelText('Judge Daily Capacity') as HTMLInputElement).value).toBe('125')
    );
    fireEvent.change(screen.getByLabelText('Judge Daily Capacity'), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: judgeDayCapacityKey('show-1') })
    );
  });

  // MYK9-1003: the automatic-offer switch is a mode that saves on its own.
  describe('automatic offers switch', () => {
    const switchName = 'Offer open spots automatically';

    it('shows the stored setting: on, with what that means', async () => {
      render(<WaitListSettingsCard showId="show-1" />);
      await waitFor(() => expect(screen.getByRole('switch', { name: switchName })).toBeChecked());
      expect(
        screen.getByText(/the next dog in line is offered it within 15 minutes/)
      ).toBeVisible();
    });

    it('shows a show that offers by hand as off', async () => {
      mockSingle.mockResolvedValue({ data: makeRow({ waitlist_auto_offer: false }), error: null });
      render(<WaitListSettingsCard showId="show-1" />);
      await waitFor(() =>
        expect(screen.getByRole('switch', { name: switchName })).not.toBeChecked()
      );
      expect(
        screen.getByText('You offer every open spot yourself, from the queue below.')
      ).toBeVisible();
    });

    it('turning it off saves only shows.waitlist_auto_offer, for this show, without Save', async () => {
      const user = userEvent.setup();
      render(<WaitListSettingsCard showId="show-1" />);
      const toggle = await screen.findByRole('switch', { name: switchName });
      await waitFor(() => expect(toggle).toBeChecked());
      // An unsaved capacity edit must not ride along with the switch.
      fireEvent.change(screen.getByLabelText('Judge Daily Capacity'), { target: { value: '150' } });

      await user.click(toggle);

      await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
      expect(mockFrom).toHaveBeenCalledWith('shows');
      expect(mockUpdate).toHaveBeenCalledWith({ waitlist_auto_offer: false });
      expect(mockUpdateEq).toHaveBeenCalledWith('id', 'show-1');
      await waitFor(() => expect(toggle).not.toBeChecked());
      expect(
        (screen.getByLabelText('Judge Daily Capacity') as HTMLInputElement).value,
        'the unsaved capacity edit stays in the form'
      ).toBe('150');
    });

    it('the Save button never writes the switch', async () => {
      render(<WaitListSettingsCard showId="show-1" />);
      await waitFor(() =>
        expect((screen.getByLabelText('Judge Daily Capacity') as HTMLInputElement).value).toBe(
          '125'
        )
      );
      fireEvent.change(screen.getByLabelText('Judge Daily Capacity'), { target: { value: '150' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
      expect(mockUpdate.mock.calls[0]).toEqual([
        expect.not.objectContaining({ waitlist_auto_offer: expect.anything() }),
      ]);
    });

    it('a failed save says so and puts the switch back', async () => {
      mockUpdateEq.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
      const user = userEvent.setup();
      render(<WaitListSettingsCard showId="show-1" />);
      const toggle = await screen.findByRole('switch', { name: switchName });
      await waitFor(() => expect(toggle).toBeChecked());

      await user.click(toggle);

      expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save that change");
      expect(toggle).toBeChecked();
    });
  });
});
