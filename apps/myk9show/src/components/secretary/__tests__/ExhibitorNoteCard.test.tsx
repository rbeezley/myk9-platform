import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { ExhibitorNoteCard } from '../ExhibitorNoteCard';

describe('ExhibitorNoteCard (MYK9-1999)', () => {
  it('shows the saved note and offers Save only once it changes', async () => {
    const onSave = vi.fn();
    const { user } = render(<ExhibitorNoteCard note="Park in the north lot." onSave={onSave} />);

    const box = screen.getByLabelText('Note');
    expect(box).toHaveValue('Park in the north lot.');
    expect(screen.queryByRole('button', { name: 'Save note' })).not.toBeInTheDocument();

    await user.type(box, ' Crates in the barn.');
    await user.click(screen.getByRole('button', { name: 'Save note' }));

    expect(onSave).toHaveBeenCalledWith('Park in the north lot. Crates in the barn.');
  });

  it('says where the note goes, and that the secretary sends nothing herself', () => {
    render(<ExhibitorNoteCard note="" onSave={vi.fn()} />);
    expect(
      screen.getByText(/Printed in the confirmation email each exhibitor gets/)
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send/i })).not.toBeInTheDocument();
  });

  it('limits the note to a length that reads well in an email', () => {
    render(<ExhibitorNoteCard note="" onSave={vi.fn()} />);
    expect(screen.getByLabelText('Note')).toHaveAttribute('maxLength', '1000');
  });
});
