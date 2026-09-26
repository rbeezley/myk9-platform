import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../supabaseClient';
import { getPublicShowById } from './publicShowDetail';
import { postgrestGetShowById } from './reads.postgrest';

const query = vi.hoisted(() => ({
  select: vi.fn(),
  eq: vi.fn(),
  in: vi.fn(),
  is: vi.fn(),
  maybeSingle: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.is.mockReturnValue(query);
  vi.mocked(supabase.from).mockReturnValue(query as never);
});

describe('getPublicShowById (MYK9-779)', () => {
  it("reads one show with anon shows_select's own filters", async () => {
    query.maybeSingle.mockResolvedValue({ data: { id: 'show-1' }, error: null });

    await expect(getPublicShowById('show-1')).resolves.toEqual({ id: 'show-1' });

    expect(supabase.from).toHaveBeenCalledWith('shows');
    expect(query.eq).toHaveBeenCalledWith('id', 'show-1');
    // shows_select (20260823190000) for anon: these statuses, never deleted.
    expect(query.in).toHaveBeenCalledWith('status', [
      'published',
      'upcoming',
      'in_progress',
      'completed',
    ]);
    expect(query.is).toHaveBeenCalledWith('deleted_at', null);
  });

  it('a show anon may not see is null, not an error', async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(getPublicShowById('show-draft')).resolves.toBeNull();
  });

  it('a failed read throws, so the caller reports an error rather than "not found"', async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom', code: '500' } });

    await expect(getPublicShowById('show-1')).rejects.toBeTruthy();
  });
});

describe('postgrestGetShowById without publicOnly', () => {
  it('keeps its signed-in shape: live rows of any status', async () => {
    query.maybeSingle.mockResolvedValue({ data: { id: 'show-1' }, error: null });

    await postgrestGetShowById('show-1');

    expect(query.is).toHaveBeenCalledWith('deleted_at', null);
    expect(query.in).not.toHaveBeenCalled();
  });
});
