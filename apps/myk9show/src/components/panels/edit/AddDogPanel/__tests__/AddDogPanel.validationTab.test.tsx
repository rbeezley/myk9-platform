import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { AddDogPanel } from '../index';

vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({
    addDog: vi.fn(),
    addDogOfflineFirst: vi.fn(),
    dogs: [],
    isLoading: false,
    error: null,
  }),
}));

// MYK9-885: Save from the Registration tab listed call name / sex / date of
// birth, which live on the Essential tab. Save must now take the user there.
describe('AddDogPanel validation failure (MYK9-885)', () => {
  it('moves from the Registration tab to the Essential tab and focuses call name', async () => {
    render(<AddDogPanel open onClose={vi.fn()} onDogCreated={vi.fn()} variant="dialog" />);

    fireEvent.click(screen.getByRole('tab', { name: /registration/i }));
    expect(screen.getByRole('tab', { name: /registration/i })).toHaveAttribute(
      'aria-selected',
      'true'
    );

    fireEvent.click(screen.getByRole('button', { name: /^add dog$/i }));

    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /essential/i })).toHaveAttribute(
        'aria-selected',
        'true'
      )
    );
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById('callName')));
    expect(screen.getByText(/please fix the following errors/i)).toBeInTheDocument();
  });
});
