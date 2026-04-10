import { describe, it, expect, vi } from 'vitest';
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

    it('has Settings and Messages in fourth group', () => {
      const titles = config.groups[3].items.map(i => i.title);
      expect(titles).toEqual(['Settings', 'Messages']);
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

    it('gets Judging section first (role navigation before browse)', () => {
      expect(config.groups[0].title).toBe('Judging');
    });

    it('gets My Shows section', () => {
      const myShows = config.groups.find(g => g.title === 'My Shows');
      expect(myShows).toBeDefined();
      expect(myShows!.items[0].title).toBe('Dashboard');
    });

    it('gets Browse section after role sections', () => {
      const browse = config.groups.find(g => g.title === 'Browse');
      expect(browse).toBeDefined();
      const browseIndex = config.groups.findIndex(g => g.title === 'Browse');
      const judgingIndex = config.groups.findIndex(g => g.title === 'Judging');
      expect(browseIndex).toBeGreaterThan(judgingIndex);
    });
  });

  describe('non-exhibitor users', () => {
    it('admin gets Admin section first (before Browse)', () => {
      const config = buildUnifiedSidebarConfig([UserRole.SITE_ADMIN]);
      expect(config.groups[0].title).toBe('Admin');
      const admin = config.groups.find(g => g.title === 'Admin');
      expect(admin).toBeDefined();
    });

    it('admin has Browse section after Admin', () => {
      const config = buildUnifiedSidebarConfig([UserRole.SITE_ADMIN]);
      const browseIndex = config.groups.findIndex(g => g.title === 'Browse');
      const adminIndex = config.groups.findIndex(g => g.title === 'Admin');
      expect(browseIndex).toBeGreaterThan(adminIndex);
    });

    it('secretary gets Manage section first (before Browse)', () => {
      const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
      expect(config.groups[0].title).toBe('Manage');
      const manage = config.groups.find(g => g.title === 'Manage');
      expect(manage).toBeDefined();
    });

    it('secretary has Browse section after Manage', () => {
      const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
      const browseIndex = config.groups.findIndex(g => g.title === 'Browse');
      const manageIndex = config.groups.findIndex(g => g.title === 'Manage');
      expect(browseIndex).toBeGreaterThan(manageIndex);
    });
  });

  describe('sidebar section ordering (priority order)', () => {
    it('verifies global ordering: Admin > Manage > Judging > My Shows > Browse > My Club', () => {
      // This test documents the intended visual priority order for users
      // with multiple roles. More operational/critical sections appear first.

      // Test case: admin + secretary + judge + exhibitor (all roles)
      const config = buildUnifiedSidebarConfig(
        [UserRole.SITE_ADMIN, UserRole.SECRETARY, UserRole.JUDGE, UserRole.EXHIBITOR],
        { clubId: 'club-1', clubName: 'Test Club' }
      );

      const sectionTitles = config.groups.map(g => g.title);

      // Extract the order of role-specific sections
      const adminIndex = sectionTitles.indexOf('Admin');
      const manageIndex = sectionTitles.indexOf('Manage');
      const judgingIndex = sectionTitles.indexOf('Judging');
      const myShowsIndex = sectionTitles.indexOf('My Shows');
      const browseIndex = sectionTitles.indexOf('Browse');
      const myClubIndex = sectionTitles.indexOf('My Club');

      // Verify ordering: Admin (first) → Manage → Judging → My Shows → Browse → My Club (last)
      expect(adminIndex).toBeLessThan(manageIndex);
      expect(manageIndex).toBeLessThan(judgingIndex);
      expect(judgingIndex).toBeLessThan(myShowsIndex);
      expect(myShowsIndex).toBeLessThan(browseIndex);
      expect(browseIndex).toBeLessThan(myClubIndex);
    });

    it('preserves exhibitor-only structure (no reordering)', () => {
      // Exhibitor-only users have 4 untitled groups in their own order
      const config = buildUnifiedSidebarConfig([UserRole.EXHIBITOR]);
      expect(config.groups).toHaveLength(4);
      config.groups.forEach(g => {
        expect(g.title).toBe('');
      });
    });

    it('admin with secretary shows Manage after Admin', () => {
      const config = buildUnifiedSidebarConfig([UserRole.SITE_ADMIN, UserRole.SECRETARY]);
      const titles = config.groups.map(g => g.title);

      const adminIdx = titles.indexOf('Admin');
      const manageIdx = titles.indexOf('Manage');

      expect(adminIdx).toBeGreaterThanOrEqual(0);
      expect(manageIdx).toBeGreaterThanOrEqual(0);
      expect(adminIdx).toBeLessThan(manageIdx);
    });

    it('judge with exhibitor shows Judging before Browse', () => {
      const config = buildUnifiedSidebarConfig([UserRole.JUDGE, UserRole.EXHIBITOR]);
      const titles = config.groups.map(g => g.title);

      const judgingIdx = titles.indexOf('Judging');
      const browseIdx = titles.indexOf('Browse');

      expect(judgingIdx).toBeGreaterThanOrEqual(0);
      expect(browseIdx).toBeGreaterThanOrEqual(0);
      expect(judgingIdx).toBeLessThan(browseIdx);
    });
  });
});
