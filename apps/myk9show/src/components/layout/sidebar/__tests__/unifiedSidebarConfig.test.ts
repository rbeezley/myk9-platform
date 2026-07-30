import { describe, it, expect } from 'vitest';
import { buildUnifiedSidebarConfig } from '../unifiedSidebarConfig';
import type { NextShowContext } from '../unifiedSidebarConfig';
import type { ClubContext } from '../unifiedSidebarConfig';
import { UserRole } from '@/types/auth-types';

describe('buildUnifiedSidebarConfig — Phase 1 nav pruning', () => {
  // ── Admin ────────────────────────────────────────────────────────────────
  it('admin sidebar keeps operational items together', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SITE_ADMIN]);
    const adminGroup = config.groups.find(g => g.title === 'Admin');
    const titles = adminGroup?.items.map(i => i.title) ?? [];
    expect(titles).toEqual([
      'Dashboard',
      'System Health',
      'Users',
      'Role Requests',
      'Onboarding',
      'Roles & Permissions',
      'Payments',
      'Sport Rules',
    ]);
  });

  it('admin sidebar puts Support and Help in a final Resources group', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SITE_ADMIN]);
    const resourcesGroup = config.groups.find(g => g.title === 'Resources');

    expect(resourcesGroup?.items.map(i => i.title)).toEqual(['Support', 'Help']);
    expect(config.groups.at(-1)?.title).toBe('Resources');
  });

  it('admin sidebar uses plain language and omits redundant descriptions', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SITE_ADMIN]);
    const adminItems = config.groups.find(g => g.title === 'Admin')?.items ?? [];

    expect(adminItems.find(i => i.title === 'Dashboard')?.description).toBeUndefined();
    expect(adminItems.find(i => i.title === 'Users')?.description).toBeUndefined();
    expect(adminItems.find(i => i.title === 'System Health')?.description).toBe(
      'Deployment and data checks'
    );
  });

  it('admin sidebar omits all parked items', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SITE_ADMIN]);
    const adminGroup = config.groups.find(g => g.title === 'Admin');
    const titles = adminGroup?.items.map(i => i.title) ?? [];
    for (const parked of [
      'Alerts',
      'Performance',
      'Analytics',
      'Data Lifecycle',
      'Performance Mode',
      'Load Testing',
      'Sync',
      'Permission Audit',
    ]) {
      expect(titles, `"${parked}" should be absent`).not.toContain(parked);
    }
  });

  it('admin sidebar links Sport Rules to the guarded read-only surface', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SITE_ADMIN]);
    const item = config.groups
      .find(group => group.title === 'Admin')
      ?.items.find(navItem => navItem.title === 'Sport Rules');

    expect(item?.href).toBe('/admin/templates');
    expect(item?.description).toBe('Seeded class rules by registry (read-only)');
  });

  it('pure site-admin sidebar stays focused on admin operations', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SITE_ADMIN]);
    expect(config.groups.map(g => g.title)).toEqual(['Admin', 'Resources']);
  });

  it('site admin with secretary role still gets staff workflow groups', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SITE_ADMIN, UserRole.SECRETARY]);
    const titles = config.groups.map(g => g.title);
    expect(titles).toContain('Admin');
    expect(titles).toContain('Manage');
    expect(titles).toContain('Show Day');
    expect(titles).toContain('Browse');
    expect(titles.at(-1)).toBe('Resources');
  });

  // ── Manage ───────────────────────────────────────────────────────────────
  it('manage sidebar items are in lifecycle order (no next show)', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
    const group = config.groups.find(g => g.title === 'Manage');
    const titles = group?.items.map(i => i.title) ?? [];
    expect(titles).toEqual(['Show Management']);
  });

  it('manage sidebar includes show name item when nextShow is provided', () => {
    const nextShow: NextShowContext = { id: 'show-1', name: 'Spring Classic', phase: 'upcoming' };
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY], undefined, nextShow);
    const group = config.groups.find(g => g.title === 'Manage');
    const titles = group?.items.map(i => i.title) ?? [];
    expect(titles).toEqual(['Show Management', 'Spring Classic']);
  });

  it('manage sidebar omits Messages because Message Center is the communication hub', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
    const group = config.groups.find(g => g.title === 'Manage');
    const titles = group?.items.map(i => i.title) ?? [];

    expect(titles).not.toContain('Messages');
    expect(group?.items.some(i => i.href === '/secretary/messages')).toBe(false);
  });

  it('manage sidebar omits Create Show and other parked items', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
    const group = config.groups.find(g => g.title === 'Manage');
    const titles = group?.items.map(i => i.title) ?? [];
    for (const absent of [
      'New Show',
      'Check-In',
      'Volunteers',
      'Settings',
      'Wait List',
      'Run Orders',
      'Pipeline',
    ]) {
      expect(titles, `"${absent}" should be absent`).not.toContain(absent);
    }
  });

  it('Show Management href is /secretary/dashboard for secretaries', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
    const group = config.groups.find(g => g.title === 'Manage');
    const item = group?.items.find(i => i.title === 'Show Management');
    expect(item?.href).toBe('/secretary/dashboard');
    expect(item?.description).toBeUndefined();
  });

  it('club admins use the My Club Members destination as their dashboard', () => {
    const config = buildUnifiedSidebarConfig([UserRole.CLUB_ADMIN]);

    expect(config.groups.find(g => g.title === 'Manage')).toBeUndefined();
    expect(config.groups.find(g => g.title === 'My Club')?.items.map(item => item.title)).toEqual([
      'Members',
      'Payments',
    ]);
    expect(
      config.groups.flatMap(g => g.items).filter(item => item.href === '/club-admin/members')
    ).toHaveLength(1);
    expect(config.dashboardHref).toBe('/club-admin/members');
  });

  it('club admin gets My Club links only from a validated live-club context', () => {
    const clubContext: ClubContext = { clubId: 'club-1', clubName: 'Heartland Club' };
    const config = buildUnifiedSidebarConfig([UserRole.CLUB_ADMIN], clubContext);
    const group = config.groups.find(g => g.title === 'My Club');

    expect(group?.items.map(item => item.href)).toEqual([
      '/shows?club=club-1',
      '/club-admin/members',
      '/club-admin/payments',
      '/clubs/club-1',
    ]);
    expect(group?.items.find(item => item.title === 'Club Profile')?.description).toBeUndefined();
    expect(group?.items.find(item => item.title === 'Members')?.description).toBeUndefined();
  });

  it('club admin keeps stable My Club links without validated context', () => {
    const config = buildUnifiedSidebarConfig([UserRole.CLUB_ADMIN]);

    expect(config.groups.find(g => g.title === 'My Club')?.items.map(item => item.href)).toEqual([
      '/club-admin/members',
      '/club-admin/payments',
    ]);
  });

  it('manage omits show link when no nextShow provided', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
    const group = config.groups.find(g => g.title === 'Manage');
    const titles = group?.items.map(i => i.title) ?? [];
    expect(titles).not.toContain('Schedule');
    expect(titles).not.toContain('Day of Show');
  });

  it('upcoming nextShow links to show setup sub-route', () => {
    const nextShow: NextShowContext = { id: 'show-1', name: 'Spring Classic', phase: 'upcoming' };
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY], undefined, nextShow);
    const group = config.groups.find(g => g.title === 'Manage');
    const item = group?.items.find(i => i.title === 'Spring Classic');
    expect(item?.href).toBe('/shows/show-1/setup');
    expect(item?.description).toBe('Setup & scheduling');
  });

  it('today nextShow links to show-desk sub-route', () => {
    const nextShow: NextShowContext = { id: 'show-1', name: 'Spring Classic', phase: 'today' };
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY], undefined, nextShow);
    const group = config.groups.find(g => g.title === 'Manage');
    const item = group?.items.find(i => i.title === 'Spring Classic');
    expect(item?.href).toBe('/shows/show-1/show-desk');
    expect(item?.description).toBe('Live today');
  });

  it('draft nextShow links to show setup sub-route', () => {
    const nextShow: NextShowContext = { id: 'show-1', name: 'Spring Classic', phase: 'draft' };
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY], undefined, nextShow);
    const group = config.groups.find(g => g.title === 'Manage');
    const item = group?.items.find(i => i.title === 'Spring Classic');
    expect(item?.href).toBe('/shows/show-1/setup');
    expect(item?.description).toBe('Draft · finish setup');
  });

  it('manage sidebar omits standalone Entries, Reports, Results & Check-In, and Submit Results', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
    const group = config.groups.find(g => g.title === 'Manage');
    const titles = group?.items.map(i => i.title) ?? [];
    for (const removed of ['Entries', 'Reports', 'Results & Check-In', 'Submit Results']) {
      expect(titles, `"${removed}" should be absent from sidebar`).not.toContain(removed);
    }
  });

  // ── Judging ──────────────────────────────────────────────────────────────
  it('judging section is absent for JUDGE role', () => {
    const config = buildUnifiedSidebarConfig([UserRole.JUDGE]);
    const judging = config.groups.find(g => g.title === 'Judging');
    expect(judging).toBeUndefined();
  });

  it('judging section is absent even when JUDGE is combined with EXHIBITOR', () => {
    const config = buildUnifiedSidebarConfig([UserRole.JUDGE, UserRole.EXHIBITOR]);
    const judging = config.groups.find(g => g.title === 'Judging');
    expect(judging).toBeUndefined();
  });

  // ── Exhibitor-only ───────────────────────────────────────────────────────
  it('exhibitor-only sidebar has exactly My Shows, My Dogs, My Payments, Ringside, Find Shows', () => {
    const config = buildUnifiedSidebarConfig([UserRole.EXHIBITOR]);
    const allTitles = config.groups.flatMap(g => g.items.map(i => i.title));
    expect(allTitles).toEqual(['My Shows', 'My Dogs', 'My Payments', 'Ringside', 'Find Shows']);
  });

  it('exhibitor-only sidebar omits descriptions from self-explanatory destinations', () => {
    const config = buildUnifiedSidebarConfig([UserRole.EXHIBITOR]);
    const items = config.groups.flatMap(g => g.items);

    expect(items.find(item => item.title === 'My Dogs')?.description).toBeUndefined();
    expect(items.find(item => item.title === 'Find Shows')?.description).toBeUndefined();
    expect(items.find(item => item.title === 'Ringside')?.description).toBeDefined();
  });

  // The permanent Ringside entry targets the bare /at-show route, which resolves
  // the showId at the destination (RingsideEntryPage) — so a static link is safe
  // for an exhibitor with several shows. It replaces the old retired
  // /exhibitor/show-day link (still asserted absent below).
  it('exhibitor-only sidebar includes a Ringside item pointing at /at-show', () => {
    const config = buildUnifiedSidebarConfig([UserRole.EXHIBITOR]);
    const item = config.groups.flatMap(g => g.items).find(i => i.title === 'Ringside');
    expect(item?.href).toBe('/at-show');
  });

  it('exhibitor-only sidebar never links to the retired /exhibitor/show-day route', () => {
    const config = buildUnifiedSidebarConfig([UserRole.EXHIBITOR]);
    const allHrefs = config.groups.flatMap(g => g.items.map(i => i.href));
    expect(allHrefs).not.toContain('/exhibitor/show-day');
  });

  it('exhibitor-only sidebar has no two items pointing at the same href', () => {
    const config = buildUnifiedSidebarConfig([UserRole.EXHIBITOR]);
    const allHrefs = config.groups.flatMap(g => g.items.map(i => i.href));
    expect(new Set(allHrefs).size).toBe(allHrefs.length);
  });

  it('exhibitor-only My Shows href is /exhibitor/entries', () => {
    const config = buildUnifiedSidebarConfig([UserRole.EXHIBITOR]);
    const item = config.groups.flatMap(g => g.items).find(i => i.title === 'My Shows');
    expect(item?.href).toBe('/exhibitor/entries');
  });

  it('exhibitor-only My Dogs href is /dogs', () => {
    const config = buildUnifiedSidebarConfig([UserRole.EXHIBITOR]);
    const item = config.groups.flatMap(g => g.items).find(i => i.title === 'My Dogs');
    expect(item?.href).toBe('/dogs');
  });

  it('exhibitor-only sidebar omits Profile, Settings, My Entries, Home', () => {
    const config = buildUnifiedSidebarConfig([UserRole.EXHIBITOR]);
    const allTitles = config.groups.flatMap(g => g.items.map(i => i.title));
    for (const absent of ['Profile', 'Settings', 'My Entries', 'Home']) {
      expect(allTitles, `"${absent}" should be absent`).not.toContain(absent);
    }
  });

  // ── Browse (multi-role) ───────────────────────────────────────────────────
  it('browse section for secretary includes Shows, Dogs, Clubs, People', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
    const browse = config.groups.find(g => g.title === 'Browse');
    const titles = browse?.items.map(i => i.title) ?? [];
    expect(titles).toEqual(['Shows', 'Dogs', 'Clubs', 'People']);
    expect(browse?.items.every(item => item.description === undefined)).toBe(true);
  });

  it('browse section for secretary omits Calendar', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
    const browse = config.groups.find(g => g.title === 'Browse');
    const titles = browse?.items.map(i => i.title) ?? [];
    expect(titles).not.toContain('Calendar');
  });

  it('browse section hides People from judge-only role', () => {
    const config = buildUnifiedSidebarConfig([UserRole.JUDGE]);
    const browse = config.groups.find(g => g.title === 'Browse');
    const titles = browse?.items.map(i => i.title) ?? [];
    expect(titles).not.toContain('People');
  });

  it('browse section shows People to secretary', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
    const browse = config.groups.find(g => g.title === 'Browse');
    const titles = browse?.items.map(i => i.title) ?? [];
    expect(titles).toContain('People');
  });

  // ── As Exhibitor (multi-role exhibitor) ──────────────────────────────────
  it('as exhibitor section has exactly one item — My Entries — for secretary+exhibitor', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY, UserRole.EXHIBITOR]);
    const group = config.groups.find(g => g.title === 'As Exhibitor');
    expect(group).toBeDefined();
    expect(group?.items.map(i => i.title)).toEqual(['My Entries']);
  });

  it('as exhibitor My Entries href is /exhibitor/entries', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY, UserRole.EXHIBITOR]);
    const group = config.groups.find(g => g.title === 'As Exhibitor');
    const item = group?.items.find(i => i.title === 'My Entries');
    expect(item?.href).toBe('/exhibitor/entries');
  });

  it('no section is titled My Shows for secretary+exhibitor', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY, UserRole.EXHIBITOR]);
    const oldSection = config.groups.find(g => g.title === 'My Shows');
    expect(oldSection).toBeUndefined();
  });

  // ── Ringside (Show Day) — permanent for staff roles ─────────────────────
  it.each([
    ['secretary', [UserRole.SECRETARY]],
    ['judge', [UserRole.JUDGE]],
    ['club admin', [UserRole.CLUB_ADMIN]],
    ['chairman', [UserRole.CHAIRMAN]],
    ['steward', [UserRole.STEWARD]],
  ] as const)(
    'multi-role sidebar (%s) has a Show Day group with Ringside → /at-show',
    (_label, roles) => {
      const config = buildUnifiedSidebarConfig([...roles]);
      const group = config.groups.find(g => g.title === 'Show Day');
      expect(group?.items.map(i => i.title)).toEqual(['Ringside']);
      expect(group?.items[0]?.href).toBe('/at-show');
    }
  );

  it('Show Day group appears immediately after Manage for a secretary', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
    const titles = config.groups.map(g => g.title);
    expect(titles.indexOf('Show Day')).toBe(titles.indexOf('Manage') + 1);
  });

  it('judge-only sidebar surfaces Ringside even though it has no Manage section', () => {
    const config = buildUnifiedSidebarConfig([UserRole.JUDGE]);
    const hrefs = config.groups.flatMap(g => g.items.map(i => i.href));
    expect(hrefs).toContain('/at-show');
  });

  // The exhibitor-block item and the multi-role "Show Day" group are gated by
  // mutually-exclusive branches (isExhibitorOnly), so no user should ever see
  // two Ringside entries. Pin that for the exhibitor-with-another-role case.
  it('secretary+exhibitor sidebar has exactly one Ringside item', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY, UserRole.EXHIBITOR]);
    const ringside = config.groups.flatMap(g => g.items).filter(i => i.href === '/at-show');
    expect(ringside).toHaveLength(1);
  });
});

// ── Sidebar account identity ──────────────────────────────────────────────
describe('buildUnifiedSidebarConfig — account identity', () => {
  it('uses firstName as accountName for every role when present', () => {
    const admin = buildUnifiedSidebarConfig([UserRole.SITE_ADMIN], undefined, undefined, 'Jamie');
    const secretary = buildUnifiedSidebarConfig(
      [UserRole.SECRETARY],
      undefined,
      undefined,
      'Jamie'
    );
    const judge = buildUnifiedSidebarConfig([UserRole.JUDGE], undefined, undefined, 'Jamie');
    const config = buildUnifiedSidebarConfig([UserRole.EXHIBITOR], undefined, undefined, 'Jamie');

    expect(admin.accountName).toBe('Jamie');
    expect(secretary.accountName).toBe('Jamie');
    expect(judge.accountName).toBe('Jamie');
    expect(config.accountName).toBe('Jamie');
  });

  it('falls back to "myK9" when firstName is null', () => {
    const config = buildUnifiedSidebarConfig([UserRole.EXHIBITOR], undefined, undefined, null);
    expect(config.accountName).toBe('myK9');
  });

  it('falls back to "myK9" when firstName is omitted', () => {
    const config = buildUnifiedSidebarConfig([UserRole.EXHIBITOR]);
    expect(config.accountName).toBe('myK9');
  });

  it('falls back to "myK9" when firstName is empty/whitespace', () => {
    const config = buildUnifiedSidebarConfig([UserRole.EXHIBITOR], undefined, undefined, '   ');
    expect(config.accountName).toBe('myK9');
  });

  it('summarizes additional roles beneath the account name', () => {
    const config = buildUnifiedSidebarConfig(
      [UserRole.EXHIBITOR, UserRole.SITE_ADMIN, UserRole.JUDGE],
      undefined,
      undefined,
      'Jamie'
    );
    expect(config.accountRoleLabel).toBe('Site Admin +2');
  });

  it.each([
    [UserRole.SITE_ADMIN, 'Site Admin'],
    [UserRole.SECRETARY, 'Secretary'],
    [UserRole.JUDGE, 'Judge'],
    [UserRole.CLUB_ADMIN, 'Club Admin'],
    [UserRole.CHAIRMAN, 'Chairman'],
    [UserRole.STEWARD, 'Steward'],
    [UserRole.EXHIBITOR, 'Exhibitor'],
  ])('uses the canonical label for %s', (role, label) => {
    const config = buildUnifiedSidebarConfig([role], undefined, undefined, 'Jamie');

    expect(config.accountRoleLabel).toBe(label);
  });
});
