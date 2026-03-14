import { describe, it, expect } from 'vitest';
import { buildUnifiedSidebarConfig } from '@/components/layout/sidebar/unifiedSidebarConfig';
import { UserRole } from '@/types/auth-types';

describe('buildUnifiedSidebarConfig', () => {
  describe('exhibitor-only users', () => {
    const config = buildUnifiedSidebarConfig([UserRole.EXHIBITOR]);

    it('produces 4 untitled groups', () => {
      expect(config.groups).toHaveLength(4);
      config.groups.forEach(g => expect(g.title).toBe(''));
    });

    it('has Home and Show Day in first group', () => {
      const titles = config.groups[0].items.map(i => i.title);
      expect(titles).toEqual(['Home', 'Show Day']);
    });

    it('has My Dogs and My Entries in second group', () => {
      const titles = config.groups[1].items.map(i => i.title);
      expect(titles).toEqual(['My Dogs', 'My Entries']);
    });

    it('has Find Shows, Clubs, Calendar in third group', () => {
      const titles = config.groups[2].items.map(i => i.title);
      expect(titles).toEqual(['Find Shows', 'Clubs', 'Calendar']);
    });

    it('has Settings in fourth group', () => {
      const titles = config.groups[3].items.map(i => i.title);
      expect(titles).toEqual(['Settings']);
    });

    it('does not include Browse group', () => {
      const allTitles = config.groups.map(g => g.title);
      expect(allTitles).not.toContain('Browse');
    });

    it('does not include People link', () => {
      const allHrefs = config.groups.flatMap(g => g.items.map(i => i.href));
      expect(allHrefs).not.toContain('/people');
    });

    it('points Home to /exhibitor/dashboard', () => {
      const home = config.groups[0].items.find(i => i.title === 'Home');
      expect(home?.href).toBe('/exhibitor/dashboard');
    });

    it('points Show Day to /exhibitor/show-day', () => {
      const showDay = config.groups[0].items.find(i => i.title === 'Show Day');
      expect(showDay?.href).toBe('/exhibitor/show-day');
    });

    it('points Settings to /preferences', () => {
      const settings = config.groups[3].items.find(i => i.title === 'Settings');
      expect(settings?.href).toBe('/preferences');
    });

    it('sets dashboardHref to /exhibitor/dashboard', () => {
      expect(config.dashboardHref).toBe('/exhibitor/dashboard');
    });

    it('sets exhibitor branding', () => {
      expect(config.headerTitle).toBe('myK9 Exhibitor');
    });
  });

  describe('exhibitor + chairman (still exhibitor-only sidebar)', () => {
    const config = buildUnifiedSidebarConfig([UserRole.EXHIBITOR, UserRole.CHAIRMAN]);

    it('gets the exhibitor-only sidebar (chairman has no sidebar section)', () => {
      expect(config.groups).toHaveLength(4);
      expect(config.groups[0].items[0].title).toBe('Home');
    });
  });

  describe('exhibitor + judge (multi-role)', () => {
    const config = buildUnifiedSidebarConfig([UserRole.EXHIBITOR, UserRole.JUDGE]);

    it('gets Browse section', () => {
      expect(config.groups[0].title).toBe('Browse');
    });

    it('gets My Shows section', () => {
      const myShows = config.groups.find(g => g.title === 'My Shows');
      expect(myShows).toBeDefined();
      expect(myShows!.items[0].title).toBe('Dashboard');
    });

    it('gets Judging section', () => {
      const judging = config.groups.find(g => g.title === 'Judging');
      expect(judging).toBeDefined();
    });
  });

  describe('non-exhibitor users', () => {
    it('admin gets Browse + Admin', () => {
      const config = buildUnifiedSidebarConfig([UserRole.SITE_ADMIN]);
      expect(config.groups[0].title).toBe('Browse');
      const admin = config.groups.find(g => g.title === 'Admin');
      expect(admin).toBeDefined();
    });

    it('secretary gets Browse + Manage', () => {
      const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
      expect(config.groups[0].title).toBe('Browse');
      const manage = config.groups.find(g => g.title === 'Manage');
      expect(manage).toBeDefined();
    });
  });
});
