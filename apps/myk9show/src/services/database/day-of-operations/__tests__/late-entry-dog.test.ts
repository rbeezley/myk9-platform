import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDog } from '@/services/database/dogs';
import { createUser } from '@/services/database/users';
import { createDayOfEntryDog } from '../late-entry-dog';

vi.mock('@/services/database/dogs', () => ({
  createDog: vi.fn(),
}));

vi.mock('@/services/database/users', () => ({
  createUser: vi.fn(),
}));

const createDogMock = vi.mocked(createDog);
const createUserMock = vi.mocked(createUser);

describe('createDayOfEntryDog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

