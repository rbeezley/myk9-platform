import { describe, it, expect } from 'vitest';
import { buildUnifiedSidebarConfig } from '../unifiedSidebarConfig';
import type { NextShowContext } from '../unifiedSidebarConfig';
import { UserRole } from '@/types/auth-types';

describe('buildUnifiedSidebarConfig — Phase 1 nav pruning', () => {
  // ── Admin ────────────────────────────────────────────────────────────────
  it('admin sidebar contains Dashboard, Users, Role Requests, Roles & Permissions, Payments, Help', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SITE_ADMIN]);
    const adminGroup = config.groups.find(g => g.title === 'Admin');
    const titles = adminGroup?.items.map(i => i.title) ?? [];
    expect(titles).toEqual([
      'Dashboard',
      'Users',
      'Role Requests',
      'Roles & Permissions',
      'Payments',
      'Help',
    ]);
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
      'Templates',
      'Onboarding',
    ]) {
      expect(titles, `"${parked}" should be absent`).not.toContain(parked);
    }
  });

  // ── Manage ───────────────────────────────────────────────────────────────
  it('manage sidebar items are in lifecycle order (no next show)', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
    const group = config.groups.find(g => g.title === 'Manage');
    const titles = group?.items.map(i => i.title) ?? [];
    expect(titles).toEqual(['Dashboard']);
  });

  it('manage sidebar includes show name item when nextShow is provided', () => {
    const nextShow: NextShowContext = { id: 'show-1', name: 'Spring Classic', phase: 'upcoming' };
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY], undefined, nextShow);
    const group = config.groups.find(g => g.title === 'Manage');
    const titles = group?.items.map(i => i.title) ?? [];
    expect(titles).toEqual(['Dashboard', 'Spring Classic']);
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

  it('manage Dashboard href is /secretary/dashboard', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
    const group = config.groups.find(g => g.title === 'Manage');
    const item = group?.items.find(i => i.title === 'Dashboard');
    expect(item?.href).toBe('/secretary/dashboard');
  });

  it('club admin-only manage Dashboard href is /club-admin/members', () => {
    const config = buildUnifiedSidebarConfig([UserRole.CLUB_ADMIN]);
    const group = config.groups.find(g => g.title === 'Manage');
    const item = group?.items.find(i => i.title === 'Dashboard');
    expect(item?.href).toBe('/club-admin/members');
    expect(config.dashboardHref).toBe('/club-admin/members');
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
  it('exhibitor-only sidebar has exactly My Shows, My Dogs, My Stats, My Payments, Ringside, Find Shows', () => {
    const config = buildUnifiedSidebarConfig([UserRole.EXHIBITOR]);
    const allTitles = config.groups.flatMap(g => g.items.map(i => i.title));
    expect(allTitles).toEqual([
      'My Shows',
      'My Dogs',
      'My Stats',
      'My Payments',
      'Ringside',
      'Find Shows',
    ]);
  });

  it('exhibitor-only My Stats href points to /exhibitor/analytics', () => {
    const config = buildUnifiedSidebarConfig([UserRole.EXHIBITOR]);
    const item = config.groups.flatMap(g => g.items).find(i => i.title === 'My Stats');
    expect(item?.href).toBe('/exhibitor/analytics');
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

  // ── Ringside (Show Day) — permanent, every role ──────────────────────────
  it.each([
    ['admin', [UserRole.SITE_ADMIN]],
    ['secretary', [UserRole.SECRETARY]],
    ['judge', [UserRole.JUDGE]],
    ['club admin', [UserRole.CLUB_ADMIN]],
  ] as const)('multi-role sidebar (%s) has a Show Day group with Ringside → /at-show', (_label, roles) => {
    const config = buildUnifiedSidebarConfig([...roles]);
    const group = config.groups.find(g => g.title === 'Show Day');
    expect(group?.items.map(i => i.title)).toEqual(['Ringside']);
    expect(group?.items[0]?.href).toBe('/at-show');
  });

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
