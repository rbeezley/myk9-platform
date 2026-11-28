import { describe, expect, it } from 'vitest';
import type { ClubAccessRequest } from '@/services/database/club-access-requests';
import { buildWaitingClubRows } from '../waitingClubRows';

function request(overrides: Partial<ClubAccessRequest>): ClubAccessRequest {
  return {
    id: 'req-1',
    requesterPersonId: 'person-1',
    requesterName: 'Liz Beezley',
    requesterEmail: 'liz@example.com',
    requestedClubName: 'Heartland Dog Club',
    requestedClubWebsite: null,
    requestNote: null,
    clubNumbers: {},
    status: 'pending',
    approvedClubId: null,
    createdClubId: null,
    createdAt: '2026-09-19T12:00:00Z',
    reviewNote: null,
    ...overrides,
  };
}

describe('buildWaitingClubRows', () => {
  it('shows a club with a pending request once, carrying the request', () => {
    const rows = buildWaitingClubRows(
      [{ id: 'club-1', name: 'Heartland Dog Club' }],
      [request({ createdClubId: 'club-1' })]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ clubId: 'club-1', request: { id: 'req-1' } });
  });

  it('keeps a waiting club that has no request (made by hand)', () => {
    const rows = buildWaitingClubRows(
      [{ id: 'club-9', name: 'Hand Made Club', createdAt: '2026-09-01T00:00:00Z' }],
      []
    );
    expect(rows).toEqual([
      {
        key: 'club-9',
        clubId: 'club-9',
        name: 'Hand Made Club',
        request: null,
        createdAt: '2026-09-01T00:00:00Z',
      },
    ]);
  });

  it('ignores a request that is no longer pending', () => {
    const rows = buildWaitingClubRows(
      [{ id: 'club-1', name: 'A' }],
      [request({ createdClubId: 'club-1', status: 'approved' })]
    );
    expect(rows[0]?.request).toBeNull();
    expect(rows).toHaveLength(1);
  });

  it('keeps a pending request whose club was never created', () => {
    const rows = buildWaitingClubRows([], [request({ createdClubId: null })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ clubId: null, name: 'Heartland Dog Club' });
  });

  it('lists the oldest waiting club first', () => {
    const rows = buildWaitingClubRows(
      [
        { id: 'new', name: 'New', createdAt: '2026-10-01T00:00:00Z' },
        { id: 'old', name: 'Old', createdAt: '2026-09-01T00:00:00Z' },
      ],
      []
    );
    expect(rows.map(row => row.clubId)).toEqual(['old', 'new']);
  });

  it('shows only the clubs the server returned when narrowed to one creator', () => {
    const rows = buildWaitingClubRows(
      [{ id: 'club-1', name: 'A' }],
      [request({ id: 'other', createdClubId: null })],
      true
    );
    expect(rows.map(row => row.clubId)).toEqual(['club-1']);
  });
});
