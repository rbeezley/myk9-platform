import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../supabaseClient';
import { getPublicClubById, getPublicDirectoryClubs } from './publicDirectory';

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

describe('getPublicClubById (MYK9-747)', () => {
  const single = { eq: vi.fn(), maybeSingle: vi.fn() };

  beforeEach(() => {
    query.select.mockReturnValue({ ...query, eq: single.eq });
    single.eq.mockReturnValue({ is: () => ({ maybeSingle: single.maybeSingle }) });
  });

  it('reads one club with the named detail columns, never *', async () => {
    single.maybeSingle.mockResolvedValue({ data: null, error: null });

    await getPublicClubById('club-1');

    expect(query.select).toHaveBeenCalledWith(
      'id, name, club_number, email, phone, website, description, logo_url, cover_image_url, accent_color, address, city, state, zip_code'
    );
    expect(single.eq).toHaveBeenCalledWith('id', 'club-1');
  });

  it('returns null when clubs_select hides the club (the page renders not-found)', async () => {
    single.maybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(getPublicClubById('club-revoked')).resolves.toBeNull();
  });

  it('maps a visible row onto the Club shape', async () => {
    single.maybeSingle.mockResolvedValue({
      data: {
        id: 'club-1',
        name: 'Heartland',
        club_number: 'H-1',
        email: 'h@club.org',
        phone: '555',
        website: null,
        description: 'About',
        logo_url: null,
        cover_image_url: 'cover.png',
        accent_color: '#123456',
        address: '1 Main St, Tulsa, OK 74103, US',
        city: null,
        state: null,
        zip_code: null,
      },
      error: null,
    });

    await expect(getPublicClubById('club-1')).resolves.toMatchObject({
      id: 'club-1',
      clubNumber: 'H-1',
      coverImage: 'cover.png',
      accentColor: '#123456',
      address: { street: '1 Main St', city: 'Tulsa', state: 'OK', zipCode: '74103', country: 'US' },
    });
  });

  it('throws on a server error so a failed read never reads as not-found', async () => {
    single.maybeSingle.mockResolvedValue({ data: null, error: { message: 'x', code: '500' } });

    await expect(getPublicClubById('club-1')).rejects.toMatchObject({ code: '500' });
  });
});
