import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDog } from '@/services/database/dogs';
import { createUser, deleteUser, searchUsers } from '@/services/database/users';
import { createDayOfEntryDog } from '../late-entry-dog';

vi.mock('@/services/database/dogs', () => ({
  createDog: vi.fn(),
}));

vi.mock('@/services/database/users', () => ({
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  searchUsers: vi.fn(),
}));

const createDogMock = vi.mocked(createDog);
const createUserMock = vi.mocked(createUser);
const deleteUserMock = vi.mocked(deleteUser);
const searchUsersMock = vi.mocked(searchUsers);

describe('createDayOfEntryDog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchUsersMock.mockResolvedValue({ data: [], error: null } as Awaited<
      ReturnType<typeof searchUsers>
    >);
    deleteUserMock.mockResolvedValue({ data: { id: 'person-1' }, error: null } as Awaited<
      ReturnType<typeof deleteUser>
    >);
  });

  it('creates an exhibitor and dog for a late entry', async () => {
    createUserMock.mockResolvedValue({
      data: {
        id: 'person-1',
        first_name: 'Jamie',
        last_name: 'Walker',
      },
      error: null,
    } as Awaited<ReturnType<typeof createUser>>);
    createDogMock.mockResolvedValue({
      data: {
        id: 'dog-1',
        name: 'Rocket Fuel',
        call_name: 'Rocket',
        breed: 'Beagle',
      },
      error: null,
    } as Awaited<ReturnType<typeof createDog>>);

    const result = await createDayOfEntryDog({
      ownerFirstName: ' Jamie ',
      ownerLastName: ' Walker ',
      ownerEmail: 'jamie@example.com',
      ownerPhone: '555-1111',
      dogName: ' Rocket Fuel ',
      dogCallName: ' Rocket ',
      dogBreed: ' Beagle ',
    });

    expect(searchUsersMock).toHaveBeenCalledWith('Walker');
    expect(createUserMock).toHaveBeenCalledWith({
      first_name: 'Jamie',
      last_name: 'Walker',
      email: 'jamie@example.com',
      phone: '555-1111',
      status: 'active',
    });
    expect(createDogMock).toHaveBeenCalledWith({
      name: 'Rocket Fuel',
      call_name: 'Rocket',
      breed: 'Beagle',
      owner_id: 'person-1',
      status: 'active',
    });
    expect(result).toEqual({
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
  });

  it('reuses an exact existing exhibitor match before creating the dog', async () => {
    searchUsersMock.mockResolvedValue({
      data: [
        {
          id: 'person-existing',
          first_name: 'Jamie',
          last_name: 'Walker',
        },
      ],
      error: null,
    } as Awaited<ReturnType<typeof searchUsers>>);
    createDogMock.mockResolvedValue({
      data: {
        id: 'dog-1',
        name: 'Rocket Fuel',
        call_name: null,
        breed: 'Mixed Breed',
      },
      error: null,
    } as Awaited<ReturnType<typeof createDog>>);

    const result = await createDayOfEntryDog({
      ownerFirstName: 'Jamie',
      ownerLastName: 'Walker',
      dogName: 'Rocket Fuel',
    });

    expect(createUserMock).not.toHaveBeenCalled();
    expect(createDogMock).toHaveBeenCalledWith({
      name: 'Rocket Fuel',
      call_name: null,
      breed: 'Mixed Breed',
      owner_id: 'person-existing',
      status: 'active',
    });
    expect(result.data?.owner?.id).toBe('person-existing');
  });

  it('soft-deletes a newly-created exhibitor when dog creation fails', async () => {
    createUserMock.mockResolvedValue({
      data: {
        id: 'person-created',
        first_name: 'Jamie',
        last_name: 'Walker',
      },
      error: null,
    } as Awaited<ReturnType<typeof createUser>>);
    createDogMock.mockResolvedValue({
      data: null,
      error: new Error('Dog insert failed'),
    } as Awaited<ReturnType<typeof createDog>>);

    const result = await createDayOfEntryDog({
      ownerFirstName: 'Jamie',
      ownerLastName: 'Walker',
      dogName: 'Rocket Fuel',
    });

    expect(deleteUserMock).toHaveBeenCalledWith('person-created');
    expect(result).toEqual({ data: null, error: new Error('Dog insert failed') });
  });

  it('rejects invalid email before creating rows', async () => {
    const result = await createDayOfEntryDog({
      ownerFirstName: 'Jamie',
      ownerLastName: 'Walker',
      ownerEmail: 'not-an-email',
      dogName: 'Rocket',
    });

    expect(searchUsersMock).not.toHaveBeenCalled();
    expect(createUserMock).not.toHaveBeenCalled();
    expect(createDogMock).not.toHaveBeenCalled();
    expect(result.error?.message).toBe('Please enter a valid email address or leave it blank.');
  });

  it('validates required exhibitor and dog names before creating rows', async () => {
    const result = await createDayOfEntryDog({
      ownerFirstName: '',
      ownerLastName: 'Walker',
      dogName: 'Rocket',
    });

    expect(createUserMock).not.toHaveBeenCalled();
    expect(createDogMock).not.toHaveBeenCalled();
    expect(result.error?.message).toBe('Please enter the exhibitor name and dog name.');
  });
});
