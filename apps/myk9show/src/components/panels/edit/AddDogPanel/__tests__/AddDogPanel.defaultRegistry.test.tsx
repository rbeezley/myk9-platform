/**
 * MYK9-832: Add Dog entered from a show starts the Registration step's
 * organization on the show's registry, not on AKC.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import { AddDogPanel } from '../index';
import { resetQuickCreateMocks } from '@/test/quickCreate/quickCreateFlowMocks';

vi.mock('@/hooks/usePeopleQuery', () => ({
  usePeopleQuery: () => ({ data: [], isLoading: false }),
}));
vi.mock(
  '@/hooks/useDogStoreCompat',
  async () => (await import('@/test/quickCreate/quickCreateFlowMocks')).dogStoreModule
);
vi.mock(
  '@/components/ui/popover',
  async () => (await import('@/test/quickCreate/quickCreateFlowMocks')).popoverModule
);

beforeEach(() => {
  resetQuickCreateMocks();
});

describe('AddDogPanel default registry (MYK9-832)', () => {
  it('starts the first registration on the show registry', async () => {
    render(
      <AddDogPanel
        open
        onClose={vi.fn()}
        onDogCreated={vi.fn()}
        userRole={UserRole.SECRETARY}
        currentUserPersonId="person-1"
        variant="inline"
        defaultRegistryId="UKC"
      />
    );
    expect(
      await screen.findByRole('combobox', { name: /Registration Organization/ })
    ).toHaveTextContent('UKC (United Kennel Club)');
  });
});
