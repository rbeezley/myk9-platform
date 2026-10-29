import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent, within } from '@/test/utils/testUtils';
import { AddEntryShowPicker } from '../AddEntryShowPicker';
import { useAddEntryPickerStore } from '../addEntryPickerStore';

vi.mock('../useEntryEligibleShows', () => ({
  useEntryEligibleShows: () => [
    { id: 'a', name: 'Spring Trial' },
    { id: 'b', name: 'Fall Trial' },
  ],
}));

describe('AddEntryShowPicker', () => {
  beforeEach(() => {
    useAddEntryPickerStore.setState({ open: false });
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
