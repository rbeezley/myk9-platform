import { describe, it, expect } from 'vitest';
import { buildUnifiedSidebarConfig } from '../unifiedSidebarConfig';
import { UserRole } from '@/types/auth-types';

describe('buildUnifiedSidebarConfig — Phase 1 nav pruning', () => {
  // ── Admin ────────────────────────────────────────────────────────────────
  it('admin sidebar contains Dashboard, Users, Roles & Permissions, Help', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SITE_ADMIN]);
    const adminGroup = config.groups.find(g => g.title === 'Admin');
    const titles = adminGroup?.items.map(i => i.title) ?? [];
    expect(titles).toEqual(['Dashboard', 'Users', 'Roles & Permissions', 'Help']);
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
  it('manage sidebar items are in lifecycle order', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
    const group = config.groups.find(g => g.title === 'Manage');
    const titles = group?.items.map(i => i.title) ?? [];
    expect(titles).toEqual([
      'Dashboard',
      'Entries',
      'Schedule',
      'Day of Show',
      'Reports',
      'Results Control',
      'Submit Results',
    ]);
  });

  it('manage sidebar omits Create Show, Messages, and parked items', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
    const group = config.groups.find(g => g.title === 'Manage');
    const titles = group?.items.map(i => i.title) ?? [];
    for (const absent of [
      'New Show',
      'Messages',
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

  it('manage Schedule href falls back to dashboard without an active show', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
    const group = config.groups.find(g => g.title === 'Manage');
    const item = group?.items.find(i => i.title === 'Schedule');
    expect(item?.href).toBe('/secretary/dashboard');
  });

  it('manage Schedule href points to Setup when an active show is known', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY], undefined, 'show-1');
    const group = config.groups.find(g => g.title === 'Manage');
    const item = group?.items.find(i => i.title === 'Schedule');
    expect(item?.href).toBe('/secretary/shows/show-1?phase=setup');
  });

  it('manage Day of Show href falls back to dashboard without an active show', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
    const group = config.groups.find(g => g.title === 'Manage');
    const item = group?.items.find(i => i.title === 'Day of Show');
    expect(item?.href).toBe('/secretary/dashboard');
  });

  it('manage Day of Show href points to Today when an active show is known', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY], undefined, 'show-1');
    const group = config.groups.find(g => g.title === 'Manage');
    const item = group?.items.find(i => i.title === 'Day of Show');
    expect(item?.href).toBe('/secretary/shows/show-1?phase=today');
  });

  it('manage Results Control href is /secretary/results-control', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
    const group = config.groups.find(g => g.title === 'Manage');
    const item = group?.items.find(i => i.title === 'Results Control');
    expect(item?.href).toBe('/secretary/results-control');
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
  it('exhibitor-only sidebar has exactly My Shows, My Dogs, Show Day, Find Shows', () => {
    const config = buildUnifiedSidebarConfig([UserRole.EXHIBITOR]);
    const allTitles = config.groups.flatMap(g => g.items.map(i => i.title));
    expect(allTitles).toEqual(['My Shows', 'My Dogs', 'Show Day', 'Find Shows']);
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
  it('as exhibitor section has exactly one item — My Shows — for secretary+exhibitor', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY, UserRole.EXHIBITOR]);
    const group = config.groups.find(g => g.title === 'As Exhibitor');
    expect(group).toBeDefined();
    expect(group?.items.map(i => i.title)).toEqual(['My Shows']);
  });

  it('as exhibitor My Shows href is /exhibitor/entries', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY, UserRole.EXHIBITOR]);
    const group = config.groups.find(g => g.title === 'As Exhibitor');
    const item = group?.items.find(i => i.title === 'My Shows');
    expect(item?.href).toBe('/exhibitor/entries');
  });

  it('no section is titled My Shows for secretary+exhibitor', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY, UserRole.EXHIBITOR]);
    const oldSection = config.groups.find(g => g.title === 'My Shows');
    expect(oldSection).toBeUndefined();
  });
});
