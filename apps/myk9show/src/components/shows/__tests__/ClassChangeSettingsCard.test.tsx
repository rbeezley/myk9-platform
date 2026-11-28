import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { ClassChangeSettingsCard } from '../ClassChangeSettingsCard';

const { mockFrom, mockSingle, mockSelect, mockUpdate, mockUpdateEq, mockUpdateSelect, mockSaved } =
  vi.hoisted(() => {
    const mockSingle = vi.fn();
    const mockEq = vi.fn(() => ({ single: mockSingle }));
    const mockSelect = vi.fn(() => ({ eq: mockEq }));
    // update(...).eq(...).select('id').single(): the save must hand back the one row it wrote.
    const mockSaved = vi.fn();
    const mockUpdateSelect = vi.fn(() => ({ single: mockSaved }));
    const mockUpdateEq = vi.fn(() => ({ select: mockUpdateSelect }));
    const mockUpdate = vi.fn(() => ({ eq: mockUpdateEq }));
    const mockFrom = vi.fn((_table?: string) => ({ select: mockSelect, update: mockUpdate }));
    return {
      mockFrom,
      mockSingle,
      mockSelect,
      mockUpdate,
      mockUpdateEq,
      mockUpdateSelect,
      mockSaved,
    };
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

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    allow_class_changes_after_close: true,
    allow_same_day_move_ups: true,
    ...overrides,
  };
}

describe('ClassChangeSettingsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSingle.mockResolvedValue({ data: makeRow(), error: null });
    mockSaved.mockResolvedValue({ data: { id: 'show-1' }, error: null });
  });

  it('reads only its two columns and shows both switches on by default', async () => {
    render(<ClassChangeSettingsCard showId="show-1" />);
    const sameDay = await screen.findByRole('switch', {
      name: 'Allow requests to move to another trial on the same day',
    });
    await waitFor(() => expect(sameDay).toBeChecked());
    expect(
      screen.getByRole('switch', { name: 'Allow class change requests after entries close' })
    ).toBeChecked();
    expect(mockSelect).toHaveBeenCalledWith(
      'allow_class_changes_after_close, allow_same_day_move_ups'
    );
  });

  it('shows a show that turned the same-day switch off as off', async () => {
    mockSingle.mockResolvedValue({
      data: makeRow({ allow_same_day_move_ups: false }),
      error: null,
    });
    render(<ClassChangeSettingsCard showId="show-1" />);
    const sameDay = await screen.findByRole('switch', {
      name: 'Allow requests to move to another trial on the same day',
    });
    await waitFor(() => expect(sameDay).not.toBeChecked());
    expect(
      screen.getByRole('switch', { name: 'Allow class change requests after entries close' })
    ).toBeChecked();
  });

  it('turning the same-day switch off saves only shows.allow_same_day_move_ups, for this show', async () => {
    const user = userEvent.setup();
    render(<ClassChangeSettingsCard showId="show-1" />);
    const toggle = await screen.findByRole('switch', {
      name: 'Allow requests to move to another trial on the same day',
    });
    await waitFor(() => expect(toggle).toBeChecked());

    await user.click(toggle);

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    expect(mockFrom).toHaveBeenCalledWith('shows');
    expect(mockUpdate).toHaveBeenCalledWith({ allow_same_day_move_ups: false });
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'show-1');
    expect(mockUpdateSelect).toHaveBeenCalledWith('id');
    await waitFor(() => expect(toggle).not.toBeChecked());
  });

  it('turning the after-close switch off saves only shows.allow_class_changes_after_close', async () => {
    const user = userEvent.setup();
    render(<ClassChangeSettingsCard showId="show-1" />);
    const toggle = await screen.findByRole('switch', {
      name: 'Allow class change requests after entries close',
    });
    await waitFor(() => expect(toggle).toBeChecked());

    await user.click(toggle);

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    expect(mockUpdate).toHaveBeenCalledWith({ allow_class_changes_after_close: false });
  });

  it('a failed save says so and puts the switch back', async () => {
    mockSaved.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    const user = userEvent.setup();
    render(<ClassChangeSettingsCard showId="show-1" />);
    const toggle = await screen.findByRole('switch', {
      name: 'Allow requests to move to another trial on the same day',
    });
    await waitFor(() => expect(toggle).toBeChecked());

    await user.click(toggle);

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save that change");
    expect(toggle).toBeChecked();
  });

  it('a save the shows policy filtered out (no row back) says so and puts the switch back', async () => {
    // PostgREST answers an UPDATE that matched no row with no error; .single() turns that into one.
    mockSaved.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
    });
    const user = userEvent.setup();
    render(<ClassChangeSettingsCard showId="show-1" />);
    const toggle = await screen.findByRole('switch', {
      name: 'Allow requests to move to another trial on the same day',
    });
    await waitFor(() => expect(toggle).toBeChecked());

    await user.click(toggle);

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save that change");
    expect(toggle).toBeChecked();
  });

  it('a failed read offers Try again instead of switches that claim the show allows changes', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });
    render(<ClassChangeSettingsCard showId="show-1" />);

    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('keeps both switches locked until the show has been read', () => {
    mockSingle.mockReturnValue(new Promise(() => {}));
    render(<ClassChangeSettingsCard showId="show-1" />);

    for (const sw of screen.getAllByRole('switch'))
      expect(sw).toHaveAttribute('aria-disabled', 'true');
  });
});
