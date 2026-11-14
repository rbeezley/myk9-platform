/**
 * MYK9-1973: "register a dog" in the wizard opens the wizard's own Add-dog
 * panel. It does not navigate away, so the selected show and step survive.
 */
import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/utils/testUtils';

const { mockRefetchDogs, addDogPanelProps } = vi.hoisted(() => ({
  mockRefetchDogs: vi.fn(),
  addDogPanelProps: vi.fn(),
}));

vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({ refetch: mockRefetchDogs }),
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ getUserRoles: () => [] }),
  getPrimaryRole: () => 'exhibitor',
}));
vi.mock('@/hooks/useRoleBasedData', () => ({ useCurrentUserPersonId: () => 'person-1' }));
vi.mock('@/components/panels/edit', () => ({
  AddDogPanel: (props: {
    open: boolean;
    onClose: () => void;
    onDogCreated: (dog: { id: string }) => void;
    createdFromShowId?: string;
  }) => {
    addDogPanelProps(props);
    return props.open ? (
      <div role="dialog" aria-label="Add dog">
        <button type="button" onClick={() => props.onDogCreated({ id: 'dog-new' })}>
          Save dog
        </button>
      </div>
    ) : null;
  },
}));

import { NoDogsYetAlert } from '../NoDogsYetAlert';

describe('NoDogsYetAlert', () => {
  it('opens the Add-dog panel instead of a link to /dogs, and re-reads the roster after a save', async () => {
    render(<NoDogsYetAlert showStartDate="2026-12-01" createdFromShowId="show-1" />);

    expect(screen.queryByRole('link', { name: 'register a dog' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'register a dog' }));
    expect(screen.getByRole('dialog', { name: 'Add dog' })).toBeInTheDocument();
    expect(addDogPanelProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ createdFromShowId: 'show-1', userRole: 'exhibitor', open: true })
    );

    await userEvent.click(screen.getByRole('button', { name: 'Save dog' }));
    expect(mockRefetchDogs).toHaveBeenCalledTimes(1);
  });
});
