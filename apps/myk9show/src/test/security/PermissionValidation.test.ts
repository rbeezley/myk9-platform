import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShowPermissionValidator } from '@/utils/permissionValidation';
import { UserRole, type UserWithRoles, PERMISSIONS, type Permission } from '@/types/auth-types';
import { Show } from '@/types/show-types';
import { ShowWithRelationship } from '@/types/unified-shows-types';

/**
 * Comprehensive security tests for the unified shows interface
 * Tests all role combinations and permission scenarios
 */

describe('Permission Validation Security Tests', () => {
  // Mock audit function to capture security events
  const mockAuditAction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock the audit function by replacing it
    vi.spyOn(ShowPermissionValidator, 'auditAction').mockImplementation(mockAuditAction);
  });

  // Test data setup
  const createMockShow = (overrides: Partial<Show> = {}): Show => {
    const show = {
      id: 'test-show-1',
      name: 'Test Show',
      organization: 'Agility',
      startDate: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      endDate: new Date(Date.now() + 172800000).toISOString(), // Day after tomorrow
      location: 'Test Location',
      status: 'Upcoming',
      events: ['Agility'],
      source: 'myK9Show',
      // Two days ago so entries read as already-open regardless of the runner's
      // timezone — entryOpenDate is a DATE column and canRegister parses it as
      // local midnight, so `new Date().toISOString()` would flip to "tomorrow"
      // (and block) once the run crosses UTC midnight.
      entryOpenDate: new Date(Date.now() - 2 * 86400000).toISOString(),
      entryCloseDate: new Date(Date.now() + 43200000).toISOString(), // 12 hours from now
      preEntryFee: '$25',
      dayOfShowFee: '$35',
      clubId: 'test-club-1',
      clubName: 'Test Club',
      clubAddress: 'Test Address',
      clubEmail: 'test@testclub.com',
      logoUrl: '',
      coverImageUrl: '',
      accentColor: '',
      assignedJudges: [
        {
          judgeId: 'judge-user-id',
          judgeName: 'Test Judge',
          assignedDate: new Date().toISOString(),
          assignedClasses: [],
        },
      ],
      stats: [],
      trials: [],
    } satisfies Show;
    for (const [key, value] of Object.entries(overrides)) {
      if (value !== undefined) Object.assign(show, { [key]: value });
    }
    return show;
  };

  const createMockUser = (
    role: UserRole,
    permissions: Permission[] = [],
    id: string = 'test-user'
  ): UserWithRoles => ({
    id,
    roles: [role],
    permissions,
    scopes: [],
    email: `${role}@test.com`,
    app_metadata: {},
    user_metadata: { first_name: 'Test', last_name: 'User' },
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  });

  const createShowWithRelationship = (
    show: Show,
    relationships: Partial<ShowWithRelationship> = {}
  ): ShowWithRelationship => ({
    ...show,
    relationship: ['all'],
    userCanManage: false,
    userIsJudging: false,
    userHasEntries: false,
    ...relationships,
  });

  describe('Role-Based Access Tests', () => {
    it('should allow guests to view public shows only', () => {
      const publicShow = createMockShow({ status: 'Upcoming' });
      const privateShow = createMockShow({ status: 'Draft' });

      expect(ShowPermissionValidator.canView(null, publicShow)).toBe(true);
      expect(ShowPermissionValidator.canView(null, privateShow)).toBe(false); // Draft shows should not be visible to guests
    });

    it('should restrict guests from performing actions', () => {
      const show = createMockShow();

      expect(ShowPermissionValidator.canCreate(null)).toBe(false);
      expect(ShowPermissionValidator.canRegister(null, show)).toBe(false);
      expect(ShowPermissionValidator.canEdit(null, createShowWithRelationship(show))).toBe(false);
      expect(ShowPermissionValidator.canDelete(null, createShowWithRelationship(show))).toBe(false);
    });

    it('should provide correct accessible tabs for guests', () => {
      const accessibleTabs = ShowPermissionValidator.getAccessibleTabs(null);
      expect(accessibleTabs).toEqual(['all', 'past']);
    });
  });

  describe('Exhibitor Role Tests', () => {
    const exhibitor = createMockUser(UserRole.EXHIBITOR);

    it('should allow exhibitors to register for shows', () => {
      const show = createMockShow();
      expect(ShowPermissionValidator.canRegister(exhibitor, show)).toBe(true);
    });

    it('should restrict exhibitors from management actions', () => {
      const show = createShowWithRelationship(createMockShow());

      expect(ShowPermissionValidator.canCreate(exhibitor)).toBe(false);
      expect(ShowPermissionValidator.canEdit(exhibitor, show)).toBe(false);
      expect(ShowPermissionValidator.canDelete(exhibitor, show)).toBe(false);
    });

    it('should provide basic tabs plus My Shows for exhibitors', () => {
      const accessibleTabs = ShowPermissionValidator.getAccessibleTabs(exhibitor);
      expect(accessibleTabs).toEqual(['all', 'past', 'entries']);
    });
  });

  describe('Secretary Role Tests', () => {
    const secretary = createMockUser(UserRole.SECRETARY, [
      PERMISSIONS.SHOW_CREATE,
      PERMISSIONS.SHOW_UPDATE,
      PERMISSIONS.SHOW_MANAGE_ENTRIES,
    ]);

    it('should allow secretaries to create shows', () => {
      expect(ShowPermissionValidator.canCreate(secretary)).toBe(true);
    });

    it('should allow secretaries to edit shows they manage', () => {
      const show = createShowWithRelationship(createMockShow(), {
        userCanManage: true,
      });

      expect(ShowPermissionValidator.canEdit(secretary, show)).toBe(true);
    });

    it("should restrict secretaries from editing shows they don't manage", () => {
      const show = createShowWithRelationship(createMockShow(), {
        userCanManage: false,
      });

      expect(ShowPermissionValidator.canEdit(secretary, show)).toBe(false);
    });

    it('should allow secretaries to manage entries for their shows', () => {
      const show = createShowWithRelationship(createMockShow(), {
        userCanManage: true,
      });

      expect(ShowPermissionValidator.canManageEntries(secretary, show)).toBe(true);
    });

    it('should provide management tabs for secretaries (no entries tab)', () => {
      const accessibleTabs = ShowPermissionValidator.getAccessibleTabs(secretary);
      expect(accessibleTabs).toEqual(['all', 'past', 'managing']);
    });
  });

  describe('Judge Role Tests', () => {
    const judge = createMockUser(UserRole.JUDGE, [], 'judge-user-id');

    it('should allow judges to view their assignments', () => {
      const show = createShowWithRelationship(createMockShow(), {
        userIsJudging: true,
      });

      expect(ShowPermissionValidator.canViewJudgeAssignments(judge, show)).toBe(true);
    });

    it('should allow judges to enter results for assigned shows', () => {
      const show = createShowWithRelationship(createMockShow(), {
        userIsJudging: true,
      });

      expect(ShowPermissionValidator.canEnterResults(judge, show)).toBe(true);
    });

    it("should restrict judges from shows they're not assigned to", () => {
      const show = createShowWithRelationship(
        createMockShow({
          assignedJudges: [
            {
              judgeId: 'other-judge',
              judgeName: 'Other Judge',
              assignedDate: new Date().toISOString(),
              assignedClasses: [],
            },
          ],
        }),
        {
          userIsJudging: false,
        }
      );

      expect(ShowPermissionValidator.canEnterResults(judge, show)).toBe(false);
    });

    it('should provide judge-specific tabs (no entries tab)', () => {
      const accessibleTabs = ShowPermissionValidator.getAccessibleTabs(judge);
      expect(accessibleTabs).toEqual(['all', 'past', 'assignments']);
    });
  });

  describe('Site Admin Role Tests', () => {
    const siteAdmin = createMockUser(UserRole.SITE_ADMIN, [
      PERMISSIONS.SHOW_CREATE,
      PERMISSIONS.SHOW_UPDATE,
      PERMISSIONS.SHOW_DELETE,
      PERMISSIONS.SHOW_MANAGE_ENTRIES,
    ]);

    it('should allow site admins to perform all actions', () => {
      const show = createShowWithRelationship(createMockShow());

      expect(ShowPermissionValidator.canCreate(siteAdmin)).toBe(true);
      expect(ShowPermissionValidator.canEdit(siteAdmin, show)).toBe(true);
      expect(ShowPermissionValidator.canDelete(siteAdmin, show)).toBe(true);
      expect(ShowPermissionValidator.canManageEntries(siteAdmin, show)).toBe(true);
    });

    it('should allow site admins to enter results for any show', () => {
      const show = createShowWithRelationship(createMockShow());
      expect(ShowPermissionValidator.canEnterResults(siteAdmin, show)).toBe(true);
    });

    it('should provide management tabs for site admins (no entries tab)', () => {
      const accessibleTabs = ShowPermissionValidator.getAccessibleTabs(siteAdmin);
      expect(accessibleTabs).toEqual(['all', 'past', 'managing']);
    });
  });

  describe('Multi-Role Users Tests', () => {
    it('should handle exhibitor + secretary combination', () => {
      const exhibitorSecretary = createMockUser(UserRole.SECRETARY, [
        PERMISSIONS.SHOW_CREATE,
        PERMISSIONS.SHOW_UPDATE,
        PERMISSIONS.SHOW_MANAGE_ENTRIES,
      ]);
      exhibitorSecretary.roles = [UserRole.EXHIBITOR, UserRole.SECRETARY];

      const accessibleTabs = ShowPermissionValidator.getAccessibleTabs(exhibitorSecretary);
      expect(accessibleTabs).toEqual(['all', 'past', 'entries', 'managing']);

      expect(ShowPermissionValidator.canCreate(exhibitorSecretary)).toBe(true);
    });

    it('should handle judge + exhibitor combination (entries + assignments)', () => {
      const judgeExhibitor = createMockUser(UserRole.JUDGE);
      judgeExhibitor.roles = [UserRole.EXHIBITOR, UserRole.JUDGE];

      const accessibleTabs = ShowPermissionValidator.getAccessibleTabs(judgeExhibitor);
      expect(accessibleTabs).toEqual(['all', 'past', 'entries', 'assignments']);
    });

    it('should handle secretary + judge combination (no entries tab)', () => {
      const secretaryJudge = createMockUser(UserRole.SECRETARY, [
        PERMISSIONS.SHOW_CREATE,
        PERMISSIONS.SHOW_UPDATE,
        PERMISSIONS.SHOW_MANAGE_ENTRIES,
      ]);
      secretaryJudge.roles = [UserRole.SECRETARY, UserRole.JUDGE];

      const accessibleTabs = ShowPermissionValidator.getAccessibleTabs(secretaryJudge);
      expect(accessibleTabs).toEqual(['all', 'past', 'managing', 'assignments']);
    });
  });

  describe('Permission Auditing Tests', () => {
    it('should audit permission checks correctly', () => {
      const user = createMockUser(UserRole.SECRETARY);

      // Test that permission check works correctly
      const result = ShowPermissionValidator.checkPermissionWithAudit(
        PERMISSIONS.SHOW_CREATE,
        user,
        'show',
        'test-show'
      );

      // Secretary without explicit SHOW_CREATE permission should return false
      expect(result).toBe(false);
    });

    it('should audit role checks correctly', () => {
      const user = createMockUser(UserRole.SECRETARY);

      // Test that role check works correctly
      const result = ShowPermissionValidator.checkRoleWithAudit(
        'secretary',
        user,
        'interface',
        'tab_access'
      );

      // User with secretary role should return true
      expect(result).toBe(true);
    });

    it('should audit failed access attempts correctly', () => {
      // Test that null user fails permission check
      const result = ShowPermissionValidator.checkPermissionWithAudit(
        PERMISSIONS.SHOW_DELETE,
        null,
        'show',
        'test-show'
      );

      // Null user should always return false
      expect(result).toBe(false);
    });
  });

  describe('Data Filtering Tests', () => {
    const shows = [
      createMockShow({ id: 'show-1', status: 'Upcoming' }),
      createMockShow({ id: 'show-2', status: 'Completed' }),
      createMockShow({ id: 'show-3', status: 'Draft' }),
    ];

    it('should filter shows for guests', () => {
      const filteredShows = ShowPermissionValidator.filterShows(shows, null);
      expect(filteredShows).toHaveLength(2); // Only Upcoming and Completed, no Draft shows
    });

    it('should show all shows for authenticated users', () => {
      const user = createMockUser(UserRole.EXHIBITOR);
      const filteredShows = ShowPermissionValidator.filterShows(shows, user);
      expect(filteredShows).toHaveLength(3); // All shows
    });

    it('should show all shows for site admins', () => {
      const admin = createMockUser(UserRole.SITE_ADMIN);
      const filteredShows = ShowPermissionValidator.filterShows(shows, admin);
      expect(filteredShows).toHaveLength(3); // All shows
    });
  });

  describe('Security Edge Cases', () => {
    it('should handle null/undefined users gracefully', () => {
      const show = createMockShow();

      expect(() => ShowPermissionValidator.canView(null, show)).not.toThrow();
      expect(() => ShowPermissionValidator.getAccessibleTabs(null)).not.toThrow();
    });

    it('should handle users without roles (no entries tab)', () => {
      const userWithoutRoles = createMockUser(UserRole.EXHIBITOR);
      userWithoutRoles.roles = [];

      const accessibleTabs = ShowPermissionValidator.getAccessibleTabs(userWithoutRoles);
      expect(accessibleTabs).toEqual(['all', 'past']);
    });

    it('should handle users without permissions', () => {
      const userWithoutPermissions = createMockUser(UserRole.SECRETARY);
      userWithoutPermissions.permissions = [];

      expect(ShowPermissionValidator.canCreate(userWithoutPermissions)).toBe(true); // Role-based access
    });

    it('should handle malformed show data', () => {
      const malformedShow = {} as Show;
      const user = createMockUser(UserRole.EXHIBITOR);

      expect(() => ShowPermissionValidator.canView(user, malformedShow)).not.toThrow();
    });
  });

  describe('Registration Time Window Tests', () => {
    it('should prevent registration for past shows', () => {
      const pastShow = createMockShow({
        startDate: new Date(Date.now() - 86400000).toISOString(), // Yesterday
        endDate: new Date(Date.now() - 43200000).toISOString(), // 12 hours ago
      });

      const user = createMockUser(UserRole.EXHIBITOR);
      expect(ShowPermissionValidator.canRegister(user, pastShow)).toBe(false);
    });

    it('should prevent registration after entry close date', () => {
      // entryCloseDate is a DATE column: entry stays open through the whole
      // close day (inclusive end-of-day, mirroring entryStatusUtils). "After
      // close" therefore means a fully-past day, not merely an hour ago.
      const closedShow = createMockShow({
        // Two full days ago so the inclusive end-of-close-day is unambiguously
        // past regardless of the runner's timezone. `- 86400000` (yesterday) is
        // flaky: after UTC midnight its ISO date-part reads as the local *today*,
        // leaving the close day still open.
        entryCloseDate: new Date(Date.now() - 2 * 86400000).toISOString(),
      });

      const user = createMockUser(UserRole.EXHIBITOR);
      expect(ShowPermissionValidator.canRegister(user, closedShow)).toBe(false);
    });

    it('should prevent registration for non-upcoming shows', () => {
      const draftShow = createMockShow({ status: 'Draft' });

      const user = createMockUser(UserRole.EXHIBITOR);
      expect(ShowPermissionValidator.canRegister(user, draftShow)).toBe(false);
    });
  });
});
