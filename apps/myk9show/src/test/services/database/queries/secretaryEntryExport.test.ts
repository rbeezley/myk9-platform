import { describe, it, expect, vi, afterEach } from 'vitest';
import { getEntriesForExport } from '@/services/database/entries';
import { mockSupabase, createChainableQuery } from '@/test/mocks/supabase';

const MOCK_RPC_ROW = {
  id: 'entry-1',
  armband: '42',
  handler: 'Jane Smith',
  payment_status: 'paid',
  entry_status: 'confirmed',
  entry_fee: 50,
  submitted_at: '2026-01-01T00:00:00Z',
  special_requests: null,
  jump_height: null,
  run_order: 1,
  dog_id: 'dog-1',
  dog_name: 'Fido',
  dog_call_name: 'Fi',
  dog_breed: 'Border Collie',
  owner_first_name: 'Alice',
  owner_last_name: 'Jones',
  owner_email: 'alice@test.com',
  owner_phone: '555-9999',
  dog_registrations: [{ organization: 'AKC', registration_number: 'NF12345' }],
  class_name: 'Novice A',
  class_number: '101',
};

describe('getEntriesForExport', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls supabase.rpc with get_entries_for_export and the show id', async () => {
    mockSupabase.rpc.mockReturnValue(createChainableQuery({ data: [], error: null }));

    await getEntriesForExport('show-abc');

    expect(mockSupabase.rpc).toHaveBeenCalledWith('get_entries_for_export', {
      p_show_id: 'show-abc',
    });
  });

  it('maps flat rpc row to nested ExportEntry shape', async () => {
    mockSupabase.rpc.mockReturnValue(createChainableQuery({ data: [MOCK_RPC_ROW], error: null }));

    const result = await getEntriesForExport('show-abc');

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);

    const entry = result.data[0];
    expect(entry.armband).toBe('42');
    expect(entry.handler).toBe('Jane Smith');
    expect(entry.dog?.name).toBe('Fido');
    expect(entry.dog?.call_name).toBe('Fi');
    expect(entry.dog?.breed).toBe('Border Collie');
    expect(entry.dog?.owner?.first_name).toBe('Alice');
    expect(entry.dog?.owner?.last_name).toBe('Jones');
    expect(entry.dog?.owner?.email).toBe('alice@test.com');
    expect(entry.dog?.owner?.phone).toBe('555-9999');
    expect(entry.dog?.dog_registrations).toEqual([
      { organization: 'AKC', registration_number: 'NF12345' },
    ]);
    expect(entry.class?.name).toBe('Novice A');
    expect(entry.class?.class_number).toBe('101');
  });

  it('maps row with null dog_id to null dog', async () => {
    const row = {
      ...MOCK_RPC_ROW,
      dog_id: null,
      dog_name: null,
      dog_call_name: null,
      dog_breed: null,
      owner_first_name: null,
      owner_last_name: null,
      owner_email: null,
      owner_phone: null,
      dog_registrations: [],
    };
    mockSupabase.rpc.mockReturnValue(createChainableQuery({ data: [row], error: null }));

    const result = await getEntriesForExport('show-abc');

    expect(result.data[0].dog).toBeNull();
  });

  it('maps row with null owner to null owner inside dog', async () => {
    const row = {
      ...MOCK_RPC_ROW,
      owner_first_name: null,
      owner_last_name: null,
      owner_email: null,
      owner_phone: null,
    };
    mockSupabase.rpc.mockReturnValue(createChainableQuery({ data: [row], error: null }));

    const result = await getEntriesForExport('show-abc');

    expect(result.data[0].dog?.owner).toBeNull();
  });

  it('maps row with empty dog_registrations to empty array', async () => {
    const row = { ...MOCK_RPC_ROW, dog_registrations: [] };
    mockSupabase.rpc.mockReturnValue(createChainableQuery({ data: [row], error: null }));

    const result = await getEntriesForExport('show-abc');

    expect(result.data[0].dog?.dog_registrations).toEqual([]);
  });

  it('returns empty array when rpc returns null data (unauthorized)', async () => {
    mockSupabase.rpc.mockReturnValue(createChainableQuery({ data: null, error: null }));

    const result = await getEntriesForExport('show-abc');

    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);
  });

  it('returns error when rpc fails', async () => {
    mockSupabase.rpc.mockReturnValue(
      createChainableQuery({ data: null, error: { message: 'permission denied', code: '42501' } })
    );

    const result = await getEntriesForExport('show-abc');

    expect(result.error).not.toBeNull();
    expect(result.data).toEqual([]);
  });
});
