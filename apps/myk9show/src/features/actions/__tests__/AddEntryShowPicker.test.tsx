import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent, within } from '@/test/utils/testUtils';
import { AddEntryShowPicker } from '../AddEntryShowPicker';
import { useAddEntryPickerStore } from '../addEntryPickerStore';

const mockShows = vi.hoisted(() => ({
  list: [] as Array<{ id: string; name: string }>,
}));
vi.mock('../useEntryEligibleShows', () => ({
  useEntryEligibleShows: () => mockShows.list,
}));

describe('AddEntryShowPicker', () => {
  beforeEach(() => {
    useAddEntryPickerStore.setState({ open: false });
    mockShows.list = [
      { id: 'a', name: 'Spring Trial' },
      { id: 'b', name: 'Fall Trial' },
    ];
  });

  it('says why when no show can take an entry any more while it is open', async () => {
    mockShows.list = [];
    render(<AddEntryShowPicker />);
    act(() => useAddEntryPickerStore.getState().setOpen(true));

    const dialog = await screen.findByRole('dialog', { name: 'Add entry to which show?' });
    expect(within(dialog).getByText(/No show can take an entry right now/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('link')).toBeNull();
  });

  it('renders nothing until Add Entry opens it', () => {
    render(<AddEntryShowPicker />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lists a register link per eligible show, scrolling within the viewport', async () => {
    render(<AddEntryShowPicker />);
    act(() => useAddEntryPickerStore.getState().setOpen(true));

    const dialog = await screen.findByRole('dialog', { name: 'Add entry to which show?' });
    expect(dialog).toHaveClass('max-h-[calc(100dvh-2rem)]', 'overflow-y-auto');
    expect(within(dialog).getByRole('link', { name: 'Spring Trial' })).toHaveAttribute(
      'href',
      '/secretary/register/a'
    );
    expect(within(dialog).getByRole('link', { name: 'Fall Trial' })).toHaveAttribute(
      'href',
      '/secretary/register/b'
    );
  });

  it('closes once a show is picked', async () => {
    render(<AddEntryShowPicker />);
    act(() => useAddEntryPickerStore.getState().setOpen(true));

    await userEvent.click(await screen.findByRole('link', { name: 'Fall Trial' }));
    expect(useAddEntryPickerStore.getState().open).toBe(false);
  });
});
