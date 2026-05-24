import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/lib/supabase';
import { accessRequestService } from './accessRequestService';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

describe('accessRequestService', () => {
  beforeEach(() => {
    vi.mocked(supabase.from).mockReset();
    vi.mocked(supabase.rpc).mockReset();
  });

  it('loads pending club access requests newest first', async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    vi.mocked(supabase.from).mockReturnValue({ select } as never);

    await accessRequestService.listPending();

    expect(supabase.from).toHaveBeenCalledWith('club_access_requests');
    expect(select).toHaveBeenCalledWith(
      'id, requester_person_id, requester_auth_user_id, requested_club_name, requested_club_website, request_note, status, approved_club_id, reviewed_by, reviewed_at, review_note, created_at, updated_at, requester:people!club_access_requests_requester_person_id_fkey(id, first_name, last_name, email)'
    );
    expect(eq).toHaveBeenCalledWith('status', 'pending');
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('loads the signed-in requesters own access requests through RLS', async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const select = vi.fn(() => ({ order }));
    vi.mocked(supabase.from).mockReturnValue({ select } as never);

    await accessRequestService.listMine();

    expect(supabase.from).toHaveBeenCalledWith('club_access_requests');
    expect(select).toHaveBeenCalledWith(
      'id, requester_person_id, requester_auth_user_id, requested_club_name, requested_club_website, request_note, status, approved_club_id, reviewed_by, reviewed_at, review_note, created_at, updated_at, requester:people!club_access_requests_requester_person_id_fkey(id, first_name, last_name, email)'
    );
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('approves a request through the review RPC', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'club-1', error: null } as never);

    const clubId = await accessRequestService.approve({
      requestId: 'request-1',
      clubName: 'River City Scent Work Club',
      reviewNote: 'Verified by email.',
    });

    expect(clubId).toBe('club-1');
    expect(supabase.rpc).toHaveBeenCalledWith('review_club_access_request', {
      p_request_id: 'request-1',
      p_decision: 'approved',
      p_existing_club_id: null,
      p_club_name: 'River City Scent Work Club',
      p_review_note: 'Verified by email.',
    });
  });

  it('denies a request through the review RPC', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never);

    await accessRequestService.deny({
      requestId: 'request-1',
      reviewNote: 'Could not verify club authority.',
    });

    expect(supabase.rpc).toHaveBeenCalledWith('review_club_access_request', {
      p_request_id: 'request-1',
      p_decision: 'denied',
      p_existing_club_id: null,
      p_club_name: null,
      p_review_note: 'Could not verify club authority.',
    });
  });

  it('approves a request against an existing club without creating a duplicate club intent', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'club-existing', error: null } as never);

    await accessRequestService.approve({
      requestId: 'request-1',
      existingClubId: 'club-existing',
      reviewNote: 'Existing club verified.',
    });

    expect(supabase.rpc).toHaveBeenCalledWith('review_club_access_request', {
      p_request_id: 'request-1',
      p_decision: 'approved',
      p_existing_club_id: 'club-existing',
      p_club_name: null,
      p_review_note: 'Existing club verified.',
    });
  });
});
