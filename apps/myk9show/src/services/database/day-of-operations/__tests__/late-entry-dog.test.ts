import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/lib/supabase';
import { deleteUser, searchUsers } from '@/services/database/users';
import { createDayOfEntryDog } from '../late-entry-dog';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

vi.mock('@/services/database/users', () => ({
  deleteUser: vi.fn(),
  searchUsers: vi.fn(),
}));

const deleteUserMock = vi.mocked(deleteUser);
const searchUsersMock = vi.mocked(searchUsers);
const rpcMock = vi.mocked(supabase.rpc);

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
    rpcMock
      .mockResolvedValueOnce({ data: 'person-1', error: null })
      .mockResolvedValueOnce({ data: 'dog-1', error: null });

    const result = await createDayOfEntryDog({
      showId: 'show-1',
      ownerFirstName: ' Jamie ',
      ownerLastName: ' Walker ',
      ownerEmail: 'jamie@example.com',
      ownerPhone: '555-1111',
      dogName: ' Rocket Fuel ',
      dogCallName: ' Rocket ',
      dogBreed: ' Beagle ',
    });

    expect(searchUsersMock).toHaveBeenCalledWith('Walker');
    expect(rpcMock).toHaveBeenNthCalledWith(1, 'create_show_managed_person', {
      p_show_id: 'show-1',
      p_first_name: 'Jamie',
      p_last_name: 'Walker',
      p_email: 'jamie@example.com',
      p_phone: '555-1111',
    });
    expect(rpcMock).toHaveBeenNthCalledWith(2, 'create_show_managed_dog', {
      p_show_id: 'show-1',
      p_owner_id: 'person-1',
      p_name: 'Rocket Fuel',
      p_breed: 'Beagle',
      p_call_name: 'Rocket',
      p_sex: null,
      p_akc_number: null,
      p_ukc_number: null,
      p_microchip_number: null,
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
    rpcMock.mockResolvedValueOnce({ data: 'dog-1', error: null });

    const result = await createDayOfEntryDog({
      showId: 'show-1',
      ownerFirstName: 'Jamie',
      ownerLastName: 'Walker',
      dogName: 'Rocket Fuel',
    });

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('create_show_managed_dog', {
      p_show_id: 'show-1',
      p_owner_id: 'person-existing',
      p_name: 'Rocket Fuel',
      p_breed: 'Mixed Breed',
      p_call_name: null,
      p_sex: null,
      p_akc_number: null,
      p_ukc_number: null,
      p_microchip_number: null,
    });
    expect(result.data?.owner?.id).toBe('person-existing');
  });

  it('soft-deletes a newly-created exhibitor when dog creation fails', async () => {
    rpcMock
      .mockResolvedValueOnce({ data: 'person-created', error: null })
      .mockResolvedValueOnce({ data: null, error: new Error('Dog insert failed') });

    const result = await createDayOfEntryDog({
      showId: 'show-1',
      ownerFirstName: 'Jamie',
      ownerLastName: 'Walker',
      dogName: 'Rocket Fuel',
    });

    expect(deleteUserMock).toHaveBeenCalledWith('person-created');
    expect(result).toEqual({ data: null, error: new Error('Dog insert failed') });
  });

  it('rejects invalid email before creating rows', async () => {
    const result = await createDayOfEntryDog({
      showId: 'show-1',
      ownerFirstName: 'Jamie',
      ownerLastName: 'Walker',
      ownerEmail: 'not-an-email',
      dogName: 'Rocket',
    });

    expect(searchUsersMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
    expect(result.error?.message).toBe('Please enter a valid email address or leave it blank.');
  });

  it('validates required exhibitor and dog names before creating rows', async () => {
    const result = await createDayOfEntryDog({
      showId: 'show-1',
      ownerFirstName: '',
      ownerLastName: 'Walker',
      dogName: 'Rocket',
    });

    expect(rpcMock).not.toHaveBeenCalled();
    expect(result.error?.message).toBe('Please enter the exhibitor name and dog name.');
  });
});
