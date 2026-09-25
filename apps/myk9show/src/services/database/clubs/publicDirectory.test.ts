import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../supabaseClient';
import { getPublicDirectoryClubs } from './publicDirectory';

const query = vi.hoisted(() => ({
  select: vi.fn(),
  is: vi.fn(),
  order: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  query.select.mockReturnValue(query);
  query.is.mockReturnValue(query);
  vi.mocked(supabase.from).mockReturnValue(query as never);
});

describe('getPublicDirectoryClubs (MYK9-747)', () => {
  it('reads clubs with the named directory columns, never *', async () => {
    query.order.mockResolvedValue({ data: [], error: null });

    await getPublicDirectoryClubs();

    expect(supabase.from).toHaveBeenCalledWith('clubs');
    expect(query.select).toHaveBeenCalledWith('id, name, description, logo_url, city, state');
    expect(query.is).toHaveBeenCalledWith('deleted_at', null);
  });

  it('maps the server rows onto the directory Club shape', async () => {
    query.order.mockResolvedValue({
      data: [
        {
          id: 'club-1',
          name: 'Heartland',
          description: null,
          logo_url: 'logo.png',
          city: 'Tulsa',
          state: 'OK',
        },
      ],
      error: null,
    });

    const [club] = await getPublicDirectoryClubs();

    expect(club).toMatchObject({
      id: 'club-1',
      name: 'Heartland',
      description: '',
      logo: 'logo.png',
      address: { city: 'Tulsa', state: 'OK' },
    });
  });

  it('throws on a server error so the directory shows an error, not zero clubs', async () => {
    query.order.mockResolvedValue({ data: null, error: { message: 'denied', code: '42501' } });

    await expect(getPublicDirectoryClubs()).rejects.toMatchObject({ code: '42501' });
  });
});
