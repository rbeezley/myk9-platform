import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import DialogFooterButtons from './DialogFooterButtons';
import StandardDialog from './StandardDialog';

describe('DialogFooterButtons', () => {
  const base = { onCancel: vi.fn(), onSubmit: vi.fn() };

  it('shows a spinner and disables the save button while submitting', () => {
    render(<DialogFooterButtons {...base} saveLabel="Save" isSubmitting />);
    const save = screen.getByRole('button', { name: /save/i });
    expect(save).toBeDisabled();
    expect(screen.getByTestId('button-spinner')).toBeInTheDocument();
  });

  it('renders no spinner when not submitting', () => {
    render(<DialogFooterButtons {...base} saveLabel="Save" />);
    expect(screen.queryByTestId('button-spinner')).not.toBeInTheDocument();
  });

  it('renders the destructive variant when destructive is set, regardless of label', () => {
    render(<DialogFooterButtons {...base} saveLabel="Remove" destructive />);
    expect(screen.getByRole('button', { name: /remove/i }).className).toContain('bg-destructive');
  });

  it('still infers destructive from a "Delete" label (legacy fallback)', () => {
    render(<DialogFooterButtons {...base} saveLabel="Delete" />);
    expect(screen.getByRole('button', { name: /delete/i }).className).toContain('bg-destructive');
  });

  it('is not destructive for a neutral label', () => {
    render(<DialogFooterButtons {...base} saveLabel="Save" />);
    expect(screen.getByRole('button', { name: /save/i }).className).not.toContain('bg-destructive');
  });

  it('forwards destructive through StandardDialog to the save action', () => {
    render(
      <StandardDialog
        open
        onClose={vi.fn()}
        onSave={vi.fn()}
        title="Remove item"
        saveLabel="Remove"
        destructive
      >
        Body
      </StandardDialog>
    );
    expect(screen.getByRole('button', { name: /remove/i }).className).toContain('bg-destructive');
  });
});
