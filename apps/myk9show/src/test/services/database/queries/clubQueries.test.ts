import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkClubNameExists, createClub } from '@/services/database/clubs';
import type { DbClubInsert } from '@/types/database-mappings';
import { mockSupabase, createChainableQuery } from '@/test/mocks/supabase';

describe('Club Queries', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates clubs through the duplicate-aware RPC', async () => {
    const input: DbClubInsert = {
      name: 'Heartland Scent Work Club',
      email: 'secretary@example.com',
    };
    const row = {
      id: 'club-1',
      name: input.name,
      email: input.email,
      phone: null,
      website: null,
      address: null,
      city: null,
      state: null,
      zip_code: null,
      club_number: null,
      logo_url: null,
      cover_image_url: null,
      accent_color: null,
      description: null,
      license_key: null,
      created_at: null,
      updated_at: null,
      deleted_at: null,
      deleted_by: null,
      default_withdrawal_cutoff_date: null,
      default_withdrawal_policy_notes: null,
      default_withdrawal_retention_type: null,
      default_withdrawal_retention_value: null,
      version: 1,
    };
    mockSupabase.rpc.mockReturnValue(createChainableQuery({ data: row, error: null }));

    const result = await createClub(input);

    expect(mockSupabase.rpc).toHaveBeenCalledWith('create_or_reuse_club', {
      p_club: input,
    });
    expect(result.data).toEqual(row);
    expect(result.error).toBeNull();
  });

  it('translates club duplicate conflicts from the RPC', async () => {
    mockSupabase.rpc.mockReturnValue(
      createChainableQuery({
        data: null,
        error: {
          code: '23505',
          message:
            'duplicate key value violates unique constraint "clubs_live_normalized_name_unique"',
        },
      })
    );

    const result = await createClub({ name: 'Heartland Scent Work Club' });

    expect(result.data).toBeNull();
    expect(result.error?.message).toBe('A club with this name already exists.');
  });

  it('checks existing club names with normalized comparison', async () => {
    mockSupabase.rpc.mockReturnValue(
      createChainableQuery({
        data: { id: 'club-1', name: 'Heartland Scent Work Club' },
        error: null,
      })
    );

    const result = await checkClubNameExists(' heartland  scent-work club ', 'other-club');

    expect(mockSupabase.rpc).toHaveBeenCalledWith('find_live_club_by_normalized_name', {
      p_name: ' heartland  scent-work club ',
      p_exclude_id: 'other-club',
    });
    expect(result.exists).toBe(true);
    expect(result.data).toEqual({ id: 'club-1', name: 'Heartland Scent Work Club' });
  });
});
