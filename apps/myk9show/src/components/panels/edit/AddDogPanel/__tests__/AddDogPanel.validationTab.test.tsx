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
  it('a jump to the last tab over an unfinished Essential tab lands on Essential and focuses call name', async () => {
    render(<AddDogPanel open onClose={vi.fn()} onDogCreated={vi.fn()} />);

    // Add Dog only exists on the last tab, and the tab bar cannot skip ahead of
    // an unfinished tab (MYK9-931, decision 13): the click holds the user on the
    // tab with the missing field instead of reaching a Save that would fail.
    fireEvent.click(screen.getByRole('tab', { name: /registration/i }));

    expect(screen.getByRole('tab', { name: /essential/i })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById('callName')));
    expect(await screen.findByTestId('edit-panel-step-blocked')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^add dog$/i })).not.toBeInTheDocument();
  });
});
