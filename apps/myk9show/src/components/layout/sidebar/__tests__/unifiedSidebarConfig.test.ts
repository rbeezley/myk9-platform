import { describe, it, expect } from 'vitest';
import { buildUnifiedSidebarConfig } from '../unifiedSidebarConfig';
import { UserRole } from '@/types/auth-types';

describe('buildUnifiedSidebarConfig — Phase 1 nav pruning', () => {
  // ── Admin ────────────────────────────────────────────────────────────────
  it('admin sidebar contains only Dashboard, Users, Roles & Permissions', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SITE_ADMIN]);
    const adminGroup = config.groups.find(g => g.title === 'Admin');
    const titles = adminGroup?.items.map(i => i.title) ?? [];
    expect(titles).toEqual(['Dashboard', 'Users', 'Roles & Permissions']);
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
  it('manage sidebar includes Results Control', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
    const group = config.groups.find(g => g.title === 'Manage');
    const titles = group?.items.map(i => i.title) ?? [];
    expect(titles).toContain('Results Control');
  });

  it('manage sidebar Results Control href is /secretary/results-control', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
    const group = config.groups.find(g => g.title === 'Manage');
    const item = group?.items.find(i => i.title === 'Results Control');
    expect(item?.href).toBe('/secretary/results-control');
  });

  it('manage sidebar omits parked items', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
    const group = config.groups.find(g => g.title === 'Manage');
    const titles = group?.items.map(i => i.title) ?? [];
    for (const parked of ['Check-In', 'Volunteers', 'Settings', 'Wait List']) {
      expect(titles, `"${parked}" should be absent`).not.toContain(parked);
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
  it('exhibitor-only sidebar omits Clubs, Calendar, Messages', () => {
    const config = buildUnifiedSidebarConfig([UserRole.EXHIBITOR]);
    const allTitles = config.groups.flatMap(g => g.items.map(i => i.title));
    for (const hidden of ['Clubs', 'Calendar', 'Messages']) {
      expect(allTitles, `"${hidden}" should be absent`).not.toContain(hidden);
    }
  });

  it('exhibitor-only sidebar includes Profile', () => {
    const config = buildUnifiedSidebarConfig([UserRole.EXHIBITOR]);
    const allTitles = config.groups.flatMap(g => g.items.map(i => i.title));
    expect(allTitles).toContain('Profile');
  });

  it('exhibitor-only Profile href is /profile', () => {
    const config = buildUnifiedSidebarConfig([UserRole.EXHIBITOR]);
    const item = config.groups.flatMap(g => g.items).find(i => i.title === 'Profile');
    expect(item?.href).toBe('/profile');
  });

  // ── Browse (multi-role) ───────────────────────────────────────────────────
  it('browse section for secretary omits Clubs and Calendar', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
    const browse = config.groups.find(g => g.title === 'Browse');
    const titles = browse?.items.map(i => i.title) ?? [];
    expect(titles).not.toContain('Clubs');
    expect(titles).not.toContain('Calendar');
  });

  // ── My Shows (multi-role exhibitor) ──────────────────────────────────────
  it('my shows section omits Entry History', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY, UserRole.EXHIBITOR]);
    const myShows = config.groups.find(g => g.title === 'My Shows');
    const titles = myShows?.items.map(i => i.title) ?? [];
    expect(titles).not.toContain('Entry History');
  });
});
