import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { 
  UserRole, 
  PERMISSIONS, 
  ScopeType, 
  MOCK_USERS 
} from '../../types/auth-types';
import { PermissionGuard, CommonGuards } from '../../components/auth/PermissionGuard';
import { useRegistrationPermissions } from '../../hooks/useRegistrationPermissions';
import { AuthProvider } from '../../context/AuthContext';
import { RegistrationProvider } from '../../context/RegistrationContext';

// Mock the auth hook
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'exhibitor-user', email: 'exhibitor@example.com' },
    loading: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    resetPassword: vi.fn(),
    updatePassword: vi.fn(),
    updateProfile: vi.fn()
  })
}));

// Test wrapper with providers
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>
    <RegistrationProvider>
      {children}
    </RegistrationProvider>
  </AuthProvider>
);

describe('RBAC System', () => {
  describe('Permission Types and Constants', () => {
    it('should have all required permission constants', () => {
      expect(PERMISSIONS.DOG_CREATE).toBe('dog:create');
      expect(PERMISSIONS.REGISTRATION_VIEW_ALL_DOGS).toBe('registration:view_all_dogs');
      expect(PERMISSIONS.REGISTRATION_REGISTER_ANY).toBe('registration:register_any');
      expect(PERMISSIONS.REGISTRATION_CREATE_EXHIBITOR).toBe('registration:create_exhibitor');
      expect(PERMISSIONS.REGISTRATION_OVERRIDE_FEES).toBe('registration:override_fees');
      expect(PERMISSIONS.REGISTRATION_ASSIGN_ARMBANDS).toBe('registration:assign_armbands');
      expect(PERMISSIONS.REGISTRATION_MANAGE_STATUS).toBe('registration:manage_status');
      expect(PERMISSIONS.REGISTRATION_BULK_OPERATIONS).toBe('registration:bulk_operations');
    });

    it('should have mock users for all roles', () => {
      expect(MOCK_USERS['exhibitor-user'].roles).toContain(UserRole.EXHIBITOR);
      expect(MOCK_USERS['secretary-user'].roles).toContain(UserRole.SECRETARY);
      expect(MOCK_USERS['club-admin-user'].roles).toContain(UserRole.CLUB_ADMIN);
      expect(MOCK_USERS['site-admin-user'].roles).toContain(UserRole.SITE_ADMIN);
    });
  });

  describe('useRegistrationPermissions Hook', () => {
    const TestComponent = ({ expectedRole }: { expectedRole: UserRole }) => {
      const { 
        hasRole,
        canViewAllDogs,
        canRegisterAnyDog,
        canCreateExhibitor,
        canOverrideFees,
        canAssignArmbands,
        canManageStatus,
        canBulkOperations,
        getRegistrationMode
      } = useRegistrationPermissions();

      return (
        <div>
          <div data-testid="has-role">{hasRole(expectedRole).toString()}</div>
          <div data-testid="can-view-all-dogs">{canViewAllDogs.toString()}</div>
          <div data-testid="can-register-any-dog">{canRegisterAnyDog.toString()}</div>
          <div data-testid="can-create-exhibitor">{canCreateExhibitor.toString()}</div>
          <div data-testid="can-override-fees">{canOverrideFees.toString()}</div>
          <div data-testid="can-assign-armbands">{canAssignArmbands.toString()}</div>
          <div data-testid="can-manage-status">{canManageStatus.toString()}</div>
          <div data-testid="can-bulk-operations">{canBulkOperations.toString()}</div>
          <div data-testid="registration-mode">{getRegistrationMode()}</div>
        </div>
      );
    };

    it('should provide correct permissions for exhibitor role', () => {
      render(
        <TestWrapper>
          <TestComponent expectedRole={UserRole.EXHIBITOR} />
        </TestWrapper>
      );

      expect(screen.getByTestId('has-role')).toHaveTextContent('true');
      expect(screen.getByTestId('can-view-all-dogs')).toHaveTextContent('false');
      expect(screen.getByTestId('can-register-any-dog')).toHaveTextContent('false');
      expect(screen.getByTestId('can-create-exhibitor')).toHaveTextContent('false');
      expect(screen.getByTestId('can-override-fees')).toHaveTextContent('false');
      expect(screen.getByTestId('can-assign-armbands')).toHaveTextContent('false');
      expect(screen.getByTestId('can-manage-status')).toHaveTextContent('false');
      expect(screen.getByTestId('can-bulk-operations')).toHaveTextContent('false');
      expect(screen.getByTestId('registration-mode')).toHaveTextContent('exhibitor');
    });
  });

  describe('PermissionGuard Component', () => {
    it('should render children when user has required permission', () => {
      render(
        <TestWrapper>
          <PermissionGuard permission={PERMISSIONS.DOG_READ}>
            <div data-testid="protected-content">Protected Content</div>
          </PermissionGuard>
        </TestWrapper>
      );

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });

    it('should not render children when user lacks required permission', () => {
      render(
        <TestWrapper>
          <PermissionGuard permission={PERMISSIONS.REGISTRATION_VIEW_ALL_DOGS}>
            <div data-testid="protected-content">Protected Content</div>
          </PermissionGuard>
        </TestWrapper>
      );

      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('should render fallback when user lacks permission', () => {
      render(
        <TestWrapper>
          <PermissionGuard 
            permission={PERMISSIONS.REGISTRATION_VIEW_ALL_DOGS}
            fallback={<div data-testid="fallback">No Permission</div>}
          >
            <div data-testid="protected-content">Protected Content</div>
          </PermissionGuard>
        </TestWrapper>
      );

      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
      expect(screen.getByTestId('fallback')).toBeInTheDocument();
    });

    it('should support role-based protection', () => {
      render(
        <TestWrapper>
          <PermissionGuard role={UserRole.EXHIBITOR}>
            <div data-testid="exhibitor-content">Exhibitor Content</div>
          </PermissionGuard>
          <PermissionGuard role={UserRole.SECRETARY}>
            <div data-testid="secretary-content">Secretary Content</div>
          </PermissionGuard>
        </TestWrapper>
      );

      expect(screen.getByTestId('exhibitor-content')).toBeInTheDocument();
      expect(screen.queryByTestId('secretary-content')).not.toBeInTheDocument();
    });

    it('should support multiple roles (OR logic)', () => {
      render(
        <TestWrapper>
          <PermissionGuard role={[UserRole.SECRETARY, UserRole.CLUB_ADMIN]}>
            <div data-testid="secretary-or-admin">Secretary or Admin Content</div>
          </PermissionGuard>
        </TestWrapper>
      );

      // Should not render because user is exhibitor, not secretary or club admin
      expect(screen.queryByTestId('secretary-or-admin')).not.toBeInTheDocument();
    });

    it('should support inverted checks with not prop', () => {
      render(
        <TestWrapper>
          <PermissionGuard permission={PERMISSIONS.REGISTRATION_VIEW_ALL_DOGS} not>
            <div data-testid="not-admin">Not Admin Content</div>
          </PermissionGuard>
        </TestWrapper>
      );

      // Should render because user does NOT have view all dogs permission
      expect(screen.getByTestId('not-admin')).toBeInTheDocument();
    });

    it('should support custom checks', () => {
      render(
        <TestWrapper>
          <PermissionGuard customCheck={() => true}>
            <div data-testid="custom-true">Custom True</div>
          </PermissionGuard>
          <PermissionGuard customCheck={() => false}>
            <div data-testid="custom-false">Custom False</div>
          </PermissionGuard>
        </TestWrapper>
      );

      expect(screen.getByTestId('custom-true')).toBeInTheDocument();
      expect(screen.queryByTestId('custom-false')).not.toBeInTheDocument();
    });
  });

  describe('CommonGuards', () => {
    it('should render ExhibitorOnly content for exhibitors', () => {
      render(
        <TestWrapper>
          <CommonGuards.ExhibitorOnly>
            <div data-testid="exhibitor-only">Exhibitor Only</div>
          </CommonGuards.ExhibitorOnly>
        </TestWrapper>
      );

      expect(screen.getByTestId('exhibitor-only')).toBeInTheDocument();
    });

    it('should not render SecretaryOrAbove content for exhibitors', () => {
      render(
        <TestWrapper>
          <CommonGuards.SecretaryOrAbove>
            <div data-testid="secretary-or-above">Secretary or Above</div>
          </CommonGuards.SecretaryOrAbove>
        </TestWrapper>
      );

      expect(screen.queryByTestId('secretary-or-above')).not.toBeInTheDocument();
    });

    it('should render SecretaryOrAbove fallback for exhibitors', () => {
      render(
        <TestWrapper>
          <CommonGuards.SecretaryOrAbove fallback={<div data-testid="fallback">Need Secretary Role</div>}>
            <div data-testid="secretary-or-above">Secretary or Above</div>
          </CommonGuards.SecretaryOrAbove>
        </TestWrapper>
      );

      expect(screen.queryByTestId('secretary-or-above')).not.toBeInTheDocument();
      expect(screen.getByTestId('fallback')).toBeInTheDocument();
    });
  });

  describe('Scoped Permissions', () => {
    it('should handle club-scoped permissions', () => {
      const TestScopedComponent = () => {
        const { hasScope } = useRegistrationPermissions();
        
        return (
          <div>
            <div data-testid="has-club-scope">
              {hasScope(ScopeType.CLUB, 'club-1').toString()}
            </div>
            <div data-testid="no-club-scope">
              {hasScope(ScopeType.CLUB, 'club-999').toString()}
            </div>
          </div>
        );
      };

      render(
        <TestWrapper>
          <TestScopedComponent />
        </TestWrapper>
      );

      // Exhibitors typically don't have club scopes
      expect(screen.getByTestId('has-club-scope')).toHaveTextContent('false');
      expect(screen.getByTestId('no-club-scope')).toHaveTextContent('false');
    });
  });

  describe('Dog Filtering', () => {
    it('should filter dogs based on user permissions', () => {
      const TestFilterComponent = () => {
        const { filterAccessibleDogs } = useRegistrationPermissions();
        
        const allDogs = [
          { id: 'dog-1', ownerId: 'test-user', clubId: 'club-1' },
          { id: 'dog-2', ownerId: 'other-user', clubId: 'club-1' },
          { id: 'dog-3', ownerId: 'test-user', clubId: 'club-2' },
          { id: 'dog-4', ownerId: 'other-user', clubId: 'club-2' }
        ];
        
        const accessibleDogs = filterAccessibleDogs(allDogs);
        
        return (
          <div>
            <div data-testid="accessible-count">{accessibleDogs.length}</div>
            <div data-testid="dog-ids">
              {accessibleDogs.map(dog => dog.id).join(',')}
            </div>
          </div>
        );
      };

      render(
        <TestWrapper>
          <TestFilterComponent />
        </TestWrapper>
      );

      // Exhibitors should only see their own dogs
      expect(screen.getByTestId('accessible-count')).toHaveTextContent('2');
      expect(screen.getByTestId('dog-ids')).toHaveTextContent('dog-1,dog-3');
    });
  });

  describe('Registration Mode Detection', () => {
    it('should return correct registration mode for different roles', () => {
      const TestModeComponent = () => {
        const { getRegistrationMode } = useRegistrationPermissions();
        
        return (
          <div data-testid="mode">{getRegistrationMode()}</div>
        );
      };

      render(
        <TestWrapper>
          <TestModeComponent />
        </TestWrapper>
      );

      expect(screen.getByTestId('mode')).toHaveTextContent('exhibitor');
    });
  });

  describe('Max Dogs Per Registration', () => {
    it('should return correct limits for different roles', () => {
      const TestLimitComponent = () => {
        const { getMaxDogsPerRegistration } = useRegistrationPermissions();
        
        return (
          <div data-testid="max-dogs">{getMaxDogsPerRegistration()}</div>
        );
      };

      render(
        <TestWrapper>
          <TestLimitComponent />
        </TestWrapper>
      );

      // Exhibitors should have a limit of 5 dogs
      expect(screen.getByTestId('max-dogs')).toHaveTextContent('5');
    });
  });
});