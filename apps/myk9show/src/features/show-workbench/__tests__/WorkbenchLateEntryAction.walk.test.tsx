import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { createTestQueryClient, render, screen } from '@/test/utils/testUtils';
import { queryKeys } from '@/lib/queryClient';
import {
  createDayOfEntry,
  createDayOfEntryDog,
  getClassesWithCapacity,
  searchDogs,
} from '@/services/database/day-of-operations';
import { WorkbenchLateEntryAction } from '../WorkbenchLateEntryAction';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'secretary-auth-1' } }),
}));

vi.mock('@/services/database/day-of-operations', () => ({
  createDayOfEntry: vi.fn(),
  createDayOfEntryDog: vi.fn(),
  getClassesWithCapacity: vi.fn(),
  searchDogs: vi.fn(),
}));

const createDayOfEntryMock = vi.mocked(createDayOfEntry);
const createDayOfEntryDogMock = vi.mocked(createDayOfEntryDog);
const getClassesWithCapacityMock = vi.mocked(getClassesWithCapacity);
const searchDogsMock = vi.mocked(searchDogs);

type CapacityClass = {
  id: string;
  name: string;
  class_number: string;
  max_entries: number;
  trial_id: string;
  accepted_count: number;
  available_spots: number;
};

function makeCapacityClass(overrides: Partial<CapacityClass> = {}): CapacityClass {
  return {
    id: 'class-1',
    name: 'Container Novice A',
    class_number: '101',
    max_entries: 25,
    trial_id: 'trial-1',
    accepted_count: 10,
    available_spots: 15,
    ...overrides,
  };
}

describe('WorkbenchLateEntryAction late-entry walk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getClassesWithCapacityMock.mockResolvedValue({
      data: [makeCapacityClass()],
      error: null,
    });
    searchDogsMock.mockResolvedValue({ data: [], error: null });
    createDayOfEntryDogMock.mockResolvedValue({
      data: {
        id: 'dog-1',
        name: 'Rocket Fuel',
        call_name: 'Rocket',
        breed: 'Beagle',
        owner: {
          id: 'person-1',
          first_name: 'Jamie',
          last_name: 'Walker',
        },
      },
      error: null,
    });
    createDayOfEntryMock.mockResolvedValue({
      data: {
        entries: [{ id: 'entry-1' }],
        armbandNumber: 42,
        classCount: 1,
        totalFees: 35,
      },
      error: null,
    });
  });

  it('adds a new exhibitor dog from Today and refreshes workbench entry surfaces', async () => {
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { user } = render(<WorkbenchLateEntryAction showId="show-1" />, { queryClient });

    await user.click(await screen.findByRole('button', { name: 'Add late entry' }));
    await user.type(screen.getByLabelText('Search for Dog'), 'Rocket');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(searchDogsMock).toHaveBeenCalledWith('Rocket');
    });
    await user.click(await screen.findByRole('button', { name: 'Create new dog' }));

    await user.type(await screen.findByLabelText(/Exhibitor First Name/), 'Jamie');
    await user.type(screen.getByLabelText(/Exhibitor Last Name/), 'Walker');
    await user.type(screen.getByLabelText('Email (optional)'), 'jamie@example.com');
    await user.type(screen.getByLabelText('Breed (optional)'), 'Beagle');
    await user.click(screen.getByRole('button', { name: 'Add dog' }));

    await waitFor(() => {
      expect(createDayOfEntryDogMock).toHaveBeenCalledWith({
        ownerFirstName: 'Jamie',
        ownerLastName: 'Walker',
        ownerEmail: 'jamie@example.com',
        ownerPhone: '',
        dogName: 'Rocket',
        dogCallName: '',
        dogBreed: 'Beagle',
      });
    });
    expect(screen.getByLabelText(/Handler Name/)).toHaveValue('Jamie Walker');

    await user.click(screen.getByLabelText(/Container Novice A/));
    await user.click(screen.getByRole('button', { name: 'Create Entry' }));

    await waitFor(() => {
      expect(createDayOfEntryMock).toHaveBeenCalledWith(
        {
          dogId: 'dog-1',
          showId: 'show-1',
          classIds: ['class-1'],
          handler: 'Jamie Walker',
          paymentMethod: 'cash',
        },
        'secretary-auth-1'
      );
    });
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.showEntries('show-1') });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.checkInReport('show-1') });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['show-workbench', 'show-1', 'class-capacity'],
      });
    });
  });
});
