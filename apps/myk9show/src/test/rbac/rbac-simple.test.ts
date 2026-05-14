import { describe, it, expect } from 'vitest';
import { 
  UserRole, 
  PERMISSIONS, 
  DEFAULT_ROLE_PERMISSIONS,
  MOCK_USERS,
  ScopeType 
} from '../../types/auth-types';

describe('RBAC Types and Constants', () => {
  describe('User Roles', () => {
    it('should have all required user roles', () => {
      expect(UserRole.EXHIBITOR).toBe('exhibitor');
      expect(UserRole.SECRETARY).toBe('secretary');
      expect(UserRole.CLUB_ADMIN).toBe('club_admin');
      expect(UserRole.SITE_ADMIN).toBe('site_admin');
    });
  });

  describe('Permissions', () => {
    it('should have all required permission constants', () => {
      expect(PERMISSIONS.DOG_CREATE).toBe('dog:create');
      expect(PERMISSIONS.DOG_READ).toBe('dog:read');
      expect(PERMISSIONS.REGISTRATION_VIEW_ALL_DOGS).toBe('registration:view_all_dogs');
      expect(PERMISSIONS.REGISTRATION_REGISTER_ANY).toBe('registration:register_any');
      expect(PERMISSIONS.REGISTRATION_CREATE_EXHIBITOR).toBe('registration:create_exhibitor');
      expect(PERMISSIONS.REGISTRATION_OVERRIDE_FEES).toBe('registration:override_fees');
      expect(PERMISSIONS.REGISTRATION_ASSIGN_ARMBANDS).toBe('registration:assign_armbands');
      expect(PERMISSIONS.REGISTRATION_MANAGE_STATUS).toBe('registration:manage_status');
      expect(PERMISSIONS.REGISTRATION_BULK_OPERATIONS).toBe('registration:bulk_operations');
    });

    it('should follow resource:action naming convention', () => {
      const allPermissions = Object.values(PERMISSIONS);
      
      allPermissions.forEach(permission => {
        expect(permission).toMatch(/^[a-z_]+:[a-z_]+$/);
      });
    });
  });

  describe('Default Role Permissions', () => {
    it('should have permissions for all roles', () => {
      expect(DEFAULT_ROLE_PERMISSIONS[UserRole.EXHIBITOR]).toBeDefined();
      expect(DEFAULT_ROLE_PERMISSIONS[UserRole.SECRETARY]).toBeDefined();
      expect(DEFAULT_ROLE_PERMISSIONS[UserRole.CLUB_ADMIN]).toBeDefined();
      expect(DEFAULT_ROLE_PERMISSIONS[UserRole.SITE_ADMIN]).toBeDefined();
    });

    it('should have proper permission hierarchy', () => {
      const exhibitorPerms = DEFAULT_ROLE_PERMISSIONS[UserRole.EXHIBITOR];
      const secretaryPerms = DEFAULT_ROLE_PERMISSIONS[UserRole.SECRETARY];
      const clubAdminPerms = DEFAULT_ROLE_PERMISSIONS[UserRole.CLUB_ADMIN];
      const siteAdminPerms = DEFAULT_ROLE_PERMISSIONS[UserRole.SITE_ADMIN];

      // Exhibitors should have basic permissions
      expect(exhibitorPerms).toContain(PERMISSIONS.DOG_CREATE);
      expect(exhibitorPerms).toContain(PERMISSIONS.DOG_READ);
      expect(exhibitorPerms).not.toContain(PERMISSIONS.REGISTRATION_VIEW_ALL_DOGS);

      // Secretaries should have more permissions than exhibitors
      expect(secretaryPerms).toContain(PERMISSIONS.REGISTRATION_VIEW_ALL_DOGS);
      expect(secretaryPerms).toContain(PERMISSIONS.REGISTRATION_REGISTER_ANY);
      expect(secretaryPerms).toContain(PERMISSIONS.REGISTRATION_CREATE_EXHIBITOR);
      expect(secretaryPerms).toContain(PERMISSIONS.REGISTRATION_BULK_OPERATIONS);

      // Club admins should have more permissions than secretaries
      expect(clubAdminPerms).toContain(PERMISSIONS.REGISTRATION_CREATE_EXHIBITOR);
      expect(clubAdminPerms).toContain(PERMISSIONS.REGISTRATION_OVERRIDE_FEES);
      expect(clubAdminPerms).toContain(PERMISSIONS.SHOW_CREATE);

      // Site admins should have all permissions
      expect(siteAdminPerms.length).toBeGreaterThan(clubAdminPerms.length);
      expect(siteAdminPerms).toContain(PERMISSIONS.SYSTEM_ADMIN);
    });
  });

  describe('Mock Users', () => {
    it('should have mock users for all roles', () => {
      expect(MOCK_USERS['exhibitor-user']).toBeDefined();
      expect(MOCK_USERS['secretary-user']).toBeDefined();
      expect(MOCK_USERS['club-admin-user']).toBeDefined();
      expect(MOCK_USERS['site-admin-user']).toBeDefined();
    });

    it('should have correct role assignments', () => {
      expect(MOCK_USERS['exhibitor-user'].roles).toContain(UserRole.EXHIBITOR);
      expect(MOCK_USERS['secretary-user'].roles).toContain(UserRole.SECRETARY);
      expect(MOCK_USERS['club-admin-user'].roles).toContain(UserRole.CLUB_ADMIN);
      expect(MOCK_USERS['site-admin-user'].roles).toContain(UserRole.SITE_ADMIN);
    });

    it('should have correct permission assignments', () => {
      const exhibitor = MOCK_USERS['exhibitor-user'];
      const secretary = MOCK_USERS['secretary-user'];
      const clubAdmin = MOCK_USERS['club-admin-user'];
      const siteAdmin = MOCK_USERS['site-admin-user'];

      // Exhibitor permissions
      expect(exhibitor.permissions).toContain(PERMISSIONS.DOG_CREATE);
      expect(exhibitor.permissions).not.toContain(PERMISSIONS.REGISTRATION_VIEW_ALL_DOGS);

      // Secretary permissions
      expect(secretary.permissions).toContain(PERMISSIONS.REGISTRATION_VIEW_ALL_DOGS);
      expect(secretary.permissions).toContain(PERMISSIONS.REGISTRATION_REGISTER_ANY);

      // Club admin permissions
      expect(clubAdmin.permissions).toContain(PERMISSIONS.REGISTRATION_CREATE_EXHIBITOR);
      expect(clubAdmin.permissions).toContain(PERMISSIONS.SHOW_CREATE);

      // Site admin permissions
      expect(siteAdmin.permissions).toContain(PERMISSIONS.SYSTEM_ADMIN);
      expect(siteAdmin.permissions.length).toBeGreaterThan(20);
    });

    it('should have correct scope assignments', () => {
      const secretary = MOCK_USERS['secretary-user'];
      const clubAdmin = MOCK_USERS['club-admin-user'];
      const exhibitor = MOCK_USERS['exhibitor-user'];
      const siteAdmin = MOCK_USERS['site-admin-user'];

      // Secretary should have club scope
      expect(secretary.scopes).toHaveLength(1);
      expect(secretary.scopes[0].scopeType).toBe(ScopeType.CLUB);
      expect(secretary.scopes[0].scopeId).toBe('club-1');

      // Club admin should have club scope
      expect(clubAdmin.scopes).toHaveLength(1);
      expect(clubAdmin.scopes[0].scopeType).toBe(ScopeType.CLUB);
      expect(clubAdmin.scopes[0].scopeId).toBe('club-1');

      // Exhibitor should have no scopes
      expect(exhibitor.scopes).toHaveLength(0);

      // Site admin should have no scopes (global access)
      expect(siteAdmin.scopes).toHaveLength(0);
    });
  });

  describe('Permission Logic', () => {
    it('should correctly identify registration permissions', () => {
      const registrationPermissions = Object.values(PERMISSIONS).filter(p => 
        p.startsWith('registration:')
      );

      expect(registrationPermissions).toContain(PERMISSIONS.REGISTRATION_VIEW_ALL_DOGS);
      expect(registrationPermissions).toContain(PERMISSIONS.REGISTRATION_REGISTER_ANY);
      expect(registrationPermissions).toContain(PERMISSIONS.REGISTRATION_CREATE_EXHIBITOR);
      expect(registrationPermissions).toContain(PERMISSIONS.REGISTRATION_OVERRIDE_FEES);
      expect(registrationPermissions).toContain(PERMISSIONS.REGISTRATION_ASSIGN_ARMBANDS);
      expect(registrationPermissions).toContain(PERMISSIONS.REGISTRATION_MANAGE_STATUS);
      expect(registrationPermissions).toContain(PERMISSIONS.REGISTRATION_BULK_OPERATIONS);
    });

    it('should have distinct permission sets for each role', () => {
      const exhibitorPerms = new Set(DEFAULT_ROLE_PERMISSIONS[UserRole.EXHIBITOR]);
      const secretaryPerms = new Set(DEFAULT_ROLE_PERMISSIONS[UserRole.SECRETARY]);
      const clubAdminPerms = new Set(DEFAULT_ROLE_PERMISSIONS[UserRole.CLUB_ADMIN]);
      const siteAdminPerms = new Set(DEFAULT_ROLE_PERMISSIONS[UserRole.SITE_ADMIN]);

      // Each role should have unique permission counts
      expect(exhibitorPerms.size).toBeLessThan(secretaryPerms.size);
      expect(secretaryPerms.size).toBeLessThan(clubAdminPerms.size);
      expect(clubAdminPerms.size).toBeLessThan(siteAdminPerms.size);

      // Secretary should have all exhibitor permissions plus more
      const exhibitorPermsArray = Array.from(exhibitorPerms);
      const secretaryHasAllExhibitorPerms = exhibitorPermsArray.every(perm => 
        secretaryPerms.has(perm)
      );
      expect(secretaryHasAllExhibitorPerms).toBe(false); // Different permission sets

      // Site admin should have most permissions
      expect(siteAdminPerms.size).toBeGreaterThan(15);
    });
  });

  describe('Scope Types', () => {
    it('should have all required scope types', () => {
      expect(ScopeType.CLUB).toBe('club');
      expect(ScopeType.SHOW).toBe('show');
    });
  });
});
