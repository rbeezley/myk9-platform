import { describe, expect, it } from 'vitest';
import {
  buildRoleViews,
  filterClubPersonRows,
  mergeClubPersonRows,
  parseRoleView,
  type ClubRowSources,
} from '../clubMemberRows';
import type { ClubMember, ClubOfficer } from '@/types/club-membership-types';
import type { ClubAdmin, ClubShowManager } from '@/services/database/club-memberships';

const member = (id: string, personId: string, name: string, status = 'active'): ClubMember =>
  ({
    id,
    clubId: 'c1',
    personId,
    personName: name,
    personEmail: `${name.split(' ')[0]?.toLowerCase()}@example.com`,
    membershipType: 'full',
    membershipStatus: status,
    joinedDate: null,
  }) as ClubMember;

const officer = (id: string, personId: string | null, position: string, name: string) =>
  ({ id, clubId: 'c1', personId, position, personName: name }) as ClubOfficer;

const admin = (personId: string, name: string): ClubAdmin => ({
  personId,
  personName: name,
  personEmail: `${name.split(' ')[0]?.toLowerCase()}@example.com`,
});

const manager = (personId: string, name: string, isClubMember: boolean): ClubShowManager => ({
  personId,
  personName: name,
  personEmail: null,
  isClubMember,
  membershipStatus: null,
});

const baseSources = (overrides: Partial<ClubRowSources> = {}): ClubRowSources => ({
  members: [],
  admins: [],
  showManagers: [],
  officers: [],
  ...overrides,
});

describe('mergeClubPersonRows', () => {
  it('a member with no other role is one row with no badges', () => {
    const rows = mergeClubPersonRows(
      baseSources({ members: [member('m1', 'p1', 'Ada Lovelace')] })
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: 'p1',
      personId: 'p1',
      name: 'Ada Lovelace',
      isAdmin: false,
      isShowSecretary: false,
      officerTitles: [],
    });
    expect(rows[0]?.member?.id).toBe('m1');
  });

  it('an admin who is not a member is a row with no member record', () => {
    const rows = mergeClubPersonRows(baseSources({ admins: [admin('p2', 'Grace Hopper')] }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      personId: 'p2',
      member: null,
      isAdmin: true,
      email: 'grace@example.com',
    });
  });

  it('a show secretary who is not a member is a row with no member record', () => {
    const rows = mergeClubPersonRows(
      baseSources({ showManagers: [manager('p3', 'Pat Secretary', false)] })
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ personId: 'p3', member: null, isShowSecretary: true });
  });

  it('a typed-name officer is its own row keyed by the officer id', () => {
    const rows = mergeClubPersonRows(
      baseSources({
        officers: [
          officer('o1', null, 'treasurer', 'Pat Typed'),
          officer('o2', null, 'treasurer', 'Pat Typed'),
        ],
      })
    );
    expect(rows.map(row => row.key)).toEqual(['officer:o1', 'officer:o2']);
    expect(rows[0]).toMatchObject({ personId: null, member: null, name: 'Pat Typed' });
    expect(rows[0]?.officerTitles.map(o => o.id)).toEqual(['o1']);
  });

  it('one person who is a member, admin, secretary and holds two titles appears once', () => {
    const rows = mergeClubPersonRows({
      members: [member('m1', 'p1', 'Mariann Smith')],
      admins: [admin('p1', 'Mariann Smith')],
      showManagers: [manager('p1', 'Mariann Smith', true)],
      officers: [
        officer('o2', 'p1', 'treasurer', 'Mariann Smith'),
        officer('o1', 'p1', 'president', 'Mariann Smith'),
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ isAdmin: true, isShowSecretary: true });
    expect(rows[0]?.officerTitles.map(o => o.position)).toEqual(['president', 'treasurer']);
  });

  it('a failed source is unknown, never absence', () => {
    const rows = mergeClubPersonRows(
      baseSources({
        members: [member('m1', 'p1', 'Ada Lovelace')],
        admins: null,
        showManagers: null,
        officers: null,
      })
    );
    expect(rows[0]).toMatchObject({ isAdmin: null, isShowSecretary: null, officersKnown: false });
  });
});

describe('role views and filtering', () => {
  const sources: ClubRowSources = {
    members: [member('m1', 'p1', 'Ada Lovelace'), member('m2', 'p2', 'Grace Hopper', 'lapsed')],
    admins: [admin('p1', 'Ada Lovelace'), admin('p9', 'Nina Outsider')],
    showManagers: [manager('p2', 'Grace Hopper', true)],
    officers: [
      officer('o1', 'p1', 'president', 'Ada Lovelace'),
      officer('o2', null, 'treasurer', 'Pat Typed'),
    ],
  };
  const rows = mergeClubPersonRows(sources);
  const names = (filtered: typeof rows) => filtered.map(row => row.name).sort();
  const all = { view: 'all', status: 'all', search: '' } as const;

  it('counts every view over the whole list', () => {
    expect(buildRoleViews(rows, sources).map(v => [v.id, v.count])).toEqual([
      ['all', 4],
      ['admins', 2],
      ['secretaries', 1],
      ['officers', 2],
    ]);
  });

  it('the Admins view keeps admins, including a non-member', () => {
    expect(names(filterClubPersonRows(rows, { ...all, view: 'admins' }))).toEqual([
      'Ada Lovelace',
      'Nina Outsider',
    ]);
  });

  it('the Show secretaries view keeps secretaries', () => {
    expect(names(filterClubPersonRows(rows, { ...all, view: 'secretaries' }))).toEqual([
      'Grace Hopper',
    ]);
  });

  it('the Officers view keeps anyone holding a title, including a typed name', () => {
    expect(names(filterClubPersonRows(rows, { ...all, view: 'officers' }))).toEqual([
      'Ada Lovelace',
      'Pat Typed',
    ]);
  });

  it('a status filter keeps only members of that status', () => {
    expect(names(filterClubPersonRows(rows, { ...all, status: 'lapsed' }))).toEqual([
      'Grace Hopper',
    ]);
  });

  it('search matches name or email', () => {
    expect(names(filterClubPersonRows(rows, { ...all, search: 'GRACE@' }))).toEqual([
      'Grace Hopper',
    ]);
    expect(names(filterClubPersonRows(rows, { ...all, search: 'typed' }))).toEqual(['Pat Typed']);
  });

  it('a view over a failed source has an unknown count and matches nobody', () => {
    const failed: ClubRowSources = { ...sources, admins: null };
    const failedRows = mergeClubPersonRows(failed);
    expect(buildRoleViews(failedRows, failed).find(v => v.id === 'admins')?.count).toBeNull();
    expect(filterClubPersonRows(failedRows, { ...all, view: 'admins' })).toEqual([]);
  });

  it('an unknown ?view= reads as all', () => {
    expect(parseRoleView('admins')).toBe('admins');
    expect(parseRoleView('bogus')).toBe('all');
    expect(parseRoleView(null)).toBe('all');
  });
});
