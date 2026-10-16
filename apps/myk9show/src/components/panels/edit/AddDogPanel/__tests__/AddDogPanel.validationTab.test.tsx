import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
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
    // A secretary may leave Registration empty, so Essential is the first unfinished tab.
    render(
      <AddDogPanel open onClose={vi.fn()} onDogCreated={vi.fn()} userRole={UserRole.SECRETARY} />
    );

    // Add Dog only exists on the last tab, and the tab bar cannot skip ahead of
    // an unfinished tab (MYK9-931, decision 13): the click holds the user on the
    // tab with the missing field instead of reaching a Save that would fail.
    fireEvent.click(screen.getByRole('tab', { name: /optional details/i }));

    expect(screen.getByRole('tab', { name: /essential/i })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById('callName')));
    expect(await screen.findByTestId('edit-panel-step-blocked')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^add dog$/i })).not.toBeInTheDocument();
  });

  // MYK9-1162: an exhibitor cannot move past Registration with none, and the gate says why.
  it('holds an exhibitor on Registration with the reason, and focuses the step heading', async () => {
    render(<AddDogPanel open onClose={vi.fn()} onDogCreated={vi.fn()} />);

    fireEvent.click(screen.getByRole('tab', { name: /essential/i }));

    expect(screen.getByRole('tab', { name: /registration/i })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(await screen.findByTestId('edit-panel-step-blocked')).toHaveTextContent(
      "Enter your dog's registration number to continue"
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(document.getElementById('registration-tab-heading'))
    );
  });
});
