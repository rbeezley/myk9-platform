import { describe, expect, it } from 'vitest';

import { FriendlySaveError, friendlySaveError } from '@/utils/friendlySaveError';
import { mapShowInputToInsert } from '@/services/mappers/showMappers';
import type { ShowInput } from '@/types/show-types';
import { requireShowClubId, SHOW_REQUIRES_CLUB_MESSAGE } from './requireShowClub';

describe('requireShowClubId (MYK9-1008)', () => {
  it.each([undefined, null, '', '   '])('refuses %j with the authored sentence', clubId => {
    expect(() => requireShowClubId(clubId)).toThrow(FriendlySaveError);
    expect(() => requireShowClubId(clubId)).toThrow(SHOW_REQUIRES_CLUB_MESSAGE);
  });

  it('returns the club id, trimmed', () => {
    expect(requireShowClubId('  club-1 ')).toBe('club-1');
  });

  it('reaches the person as written, not as generic save copy', () => {
    let caught: unknown;
    try {
      requireShowClubId('');
    } catch (error) {
      caught = error;
    }
    expect(friendlySaveError(caught).description).toContain(SHOW_REQUIRES_CLUB_MESSAGE);
  });
});

describe('mapShowInputToInsert club requirement (MYK9-1008)', () => {
  const input = {
    name: 'Spring Scent Work',
    organization: 'AKC',
    startDate: '2026-06-01',
    endDate: '2026-06-02',
    location: 'Roseville, CA',
    preEntryFee: '30',
    dayOfShowFee: '35',
    clubId: 'club-1',
  } as ShowInput;

  it('refuses a show input with no club', () => {
    expect(() => mapShowInputToInsert({ ...input, clubId: '' })).toThrow(
      SHOW_REQUIRES_CLUB_MESSAGE
    );
  });

  it('maps the club to club_id', () => {
    expect(mapShowInputToInsert(input).club_id).toBe('club-1');
  });
});
