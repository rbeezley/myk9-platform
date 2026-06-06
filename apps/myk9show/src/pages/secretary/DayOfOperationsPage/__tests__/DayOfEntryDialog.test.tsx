import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { toast } from 'sonner';
import {
  createDayOfEntry,
  createDayOfEntryDog,
  searchDogs,
  type ClassWithCapacity,
} from '@/services/database/day-of-operations';
import { DayOfEntryDialog } from '../DayOfEntryDialog';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/services/database/day-of-operations', () => ({
  createDayOfEntry: vi.fn(),
  createDayOfEntryDog: vi.fn(),
  searchDogs: vi.fn(),
}));

const createDayOfEntryMock = vi.mocked(createDayOfEntry);
const createDayOfEntryDogMock = vi.mocked(createDayOfEntryDog);
const searchDogsMock = vi.mocked(searchDogs);
const toastErrorMock = vi.mocked(toast.error);

const classes: ClassWithCapacity[] = [
  {
    id: 'class-1',
    name: 'Container Novice A',
    class_number: '101',
    max_entries: 25,
    trial_id: 'trial-1',
    accepted_count: 10,
    available_spots: 15,
  },
];

describe('DayOfEntryDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        entries: [],
        armbandNumber: 42,
        classCount: 1,
        totalFees: 35,
      },
      error: null,
    });
  });

  it('creates a new exhibitor and dog from an empty dog search, then enters the dog', async () => {
    const onSuccess = vi.fn();
    const { user } = render(
      <DayOfEntryDialog
        open
        onOpenChange={vi.fn()}
        showId="show-1"
        userId="secretary-auth-1"
        classes={classes}
        onSuccess={onSuccess}
      />
    );

    await user.type(screen.getByLabelText('Search for Dog'), 'Rocket');
    await user.keyboard('{Enter}');
    await user.click(await screen.findByRole('button', { name: 'Create new dog' }));

    await user.type(await screen.findByLabelText(/Exhibitor First Name/), 'Jamie');
    await user.type(screen.getByLabelText(/Exhibitor Last Name/), 'Walker');
    await user.type(screen.getByLabelText('Email (optional)'), 'jamie@example.com');
    await user.type(screen.getByLabelText('Phone (optional)'), '555-1111');
    expect(screen.getByLabelText(/Dog Name/)).toHaveValue('Rocket');
    await user.type(screen.getByLabelText('Call Name (optional)'), 'Rocket');
    await user.type(screen.getByLabelText('Breed (optional)'), 'Beagle');
    await user.click(screen.getByRole('button', { name: 'Add dog' }));

    await waitFor(() => {
      expect(createDayOfEntryDogMock).toHaveBeenCalledWith({
        ownerFirstName: 'Jamie',
        ownerLastName: 'Walker',
        ownerEmail: 'jamie@example.com',
        ownerPhone: '555-1111',
        dogName: 'Rocket',
        dogCallName: 'Rocket',
        dogBreed: 'Beagle',
      });
    });

    expect(screen.getByText('Rocket Fuel')).toBeInTheDocument();
    expect(screen.getByLabelText(/Handler Name/)).toHaveValue('Jamie Walker');

    await user.click(screen.getByRole('checkbox', { name: /Container Novice A/ }));
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
    expect(onSuccess).toHaveBeenCalled();
  });

  it('does not clear a typed handler when selecting a replicated dog without owner names', async () => {
    searchDogsMock.mockResolvedValueOnce({
      data: [
        {
          id: 'dog-existing',
          name: 'Existing Rocket',
          call_name: 'Rocket',
          breed: 'Beagle',
          owner: null,
        },
      ],
      error: null,
    });

    const { user } = render(
      <DayOfEntryDialog
        open
        onOpenChange={vi.fn()}
        showId="show-1"
        userId="secretary-auth-1"
        classes={classes}
        onSuccess={vi.fn()}
      />
    );

    await user.type(screen.getByLabelText(/Handler Name/), 'Jamie Walker');
    await user.type(screen.getByLabelText('Search for Dog'), 'Rocket');
    await user.keyboard('{Enter}');
    await user.click(await screen.findByText('Existing Rocket'));

    expect(screen.getByLabelText(/Handler Name/)).toHaveValue('Jamie Walker');
  });

  it('keeps new dog fields open when dog creation fails', async () => {
    createDayOfEntryDogMock.mockResolvedValueOnce({
      data: null,
      error: new Error('Unable to create dog.'),
    });
    const { user } = render(
      <DayOfEntryDialog
        open
        onOpenChange={vi.fn()}
        showId="show-1"
        userId="secretary-auth-1"
        classes={classes}
        onSuccess={vi.fn()}
      />
    );

    await user.type(screen.getByLabelText('Search for Dog'), 'Rocket');
    await user.keyboard('{Enter}');
    await user.click(await screen.findByRole('button', { name: 'Create new dog' }));
    await user.type(await screen.findByLabelText(/Exhibitor First Name/), 'Jamie');
    await user.type(screen.getByLabelText(/Exhibitor Last Name/), 'Walker');
    await user.click(screen.getByRole('button', { name: 'Add dog' }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalled();
    });
    expect(screen.getByRole('heading', { name: 'New exhibitor and dog' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Exhibitor First Name/)).toHaveValue('Jamie');
    expect(screen.getByLabelText(/Dog Name/)).toHaveValue('Rocket');
    expect(screen.queryByText('Rocket Fuel')).not.toBeInTheDocument();
  });
});
