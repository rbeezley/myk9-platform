import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { 
  ScopeType
} from '../../types/auth-types';
import { useRegistrationPermissions } from '../../hooks/useRegistrationPermissions';
import { AuthProvider } from '../../context/AuthContext';
import { RegistrationProvider } from '../../context/RegistrationContext';

// Helper to create test scenarios with different user roles
const createTestScenario = (userEmail: string) => {
  // Mock the auth hook for specific user
  vi.doMock('../../hooks/useAuth', () => ({
    useAuth: () => ({
      user: { id: 'test-user', email: userEmail },
      loading: false,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      resetPassword: vi.fn(),
      updatePassword: vi.fn(),
      updateProfile: vi.fn()
    })
  }));
};

// Test wrapper
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>
    <RegistrationProvider>
      {children}
    </RegistrationProvider>
  </AuthProvider>
);

// Component to test permissions
const PermissionTestComponent = () => {
  const {
    canViewAllDogs,
    canRegisterAnyDog,
    canCreateExhibitor,
    canOverrideFees,
    canAssignArmbands,
    canManageStatus,
    canBulkOperations,
    getRegistrationMode,
    getMaxDogsPerRegistration,
    canUseAdvancedSearch,
    isExhibitor,
    isSecretary,
    isClubAdmin,
    isSiteAdmin,
    roles
  } = useRegistrationPermissions();

  return (
    <div>
      <div data-testid="roles">{roles.join(',')}</div>
      <div data-testid="is-exhibitor">{isExhibitor.toString()}</div>
      <div data-testid="is-secretary">{isSecretary.toString()}</div>
      <div data-testid="is-club-admin">{isClubAdmin.toString()}</div>
      <div data-testid="is-site-admin">{isSiteAdmin.toString()}</div>
      <div data-testid="can-view-all-dogs">{canViewAllDogs.toString()}</div>
      <div data-testid="can-register-any-dog">{canRegisterAnyDog.toString()}</div>
      <div data-testid="can-create-exhibitor">{canCreateExhibitor.toString()}</div>
      <div data-testid="can-override-fees">{canOverrideFees.toString()}</div>
      <div data-testid="can-assign-armbands">{canAssignArmbands.toString()}</div>
      <div data-testid="can-manage-status">{canManageStatus.toString()}</div>
      <div data-testid="can-bulk-operations">{canBulkOperations.toString()}</div>
      <div data-testid="registration-mode">{getRegistrationMode()}</div>
      <div data-testid="max-dogs">{getMaxDogsPerRegistration()}</div>
      <div data-testid="can-use-advanced-search">{canUseAdvancedSearch().toString()}</div>
    </div>
  );
};

describe('Role-Based Permission Scenarios', () => {
  describe('Exhibitor Role', () => {
    beforeEach(() => {
      createTestScenario('exhibitor@example.com');
    });

    it('should have exhibitor permissions only', () => {
      render(
        <TestWrapper>
          <PermissionTestComponent />
        </TestWrapper>
      );

      expect(screen.getByTestId('roles')).toHaveTextContent('exhibitor');
      expect(screen.getByTestId('is-exhibitor')).toHaveTextContent('true');
      expect(screen.getByTestId('is-secretary')).toHaveTextContent('false');
      expect(screen.getByTestId('is-club-admin')).toHaveTextContent('false');
      expect(screen.getByTestId('is-site-admin')).toHaveTextContent('false');
      
      // Exhibitor limitations
      expect(screen.getByTestId('can-view-all-dogs')).toHaveTextContent('false');
      expect(screen.getByTestId('can-register-any-dog')).toHaveTextContent('false');
      expect(screen.getByTestId('can-create-exhibitor')).toHaveTextContent('false');
      expect(screen.getByTestId('can-override-fees')).toHaveTextContent('false');
      expect(screen.getByTestId('can-assign-armbands')).toHaveTextContent('false');
      expect(screen.getByTestId('can-manage-status')).toHaveTextContent('false');
      expect(screen.getByTestId('can-bulk-operations')).toHaveTextContent('false');
      
      // Exhibitor workflow
      expect(screen.getByTestId('registration-mode')).toHaveTextContent('exhibitor');
      expect(screen.getByTestId('max-dogs')).toHaveTextContent('5');
      expect(screen.getByTestId('can-use-advanced-search')).toHaveTextContent('false');
    });
  });

  describe('Secretary Role', () => {
    beforeEach(() => {
      createTestScenario('secretary@example.com');
    });

    it('should have secretary permissions', () => {
      render(
        <TestWrapper>
          <PermissionTestComponent />
        </TestWrapper>
      );

      expect(screen.getByTestId('roles')).toHaveTextContent('secretary');
      expect(screen.getByTestId('is-exhibitor')).toHaveTextContent('false');
      expect(screen.getByTestId('is-secretary')).toHaveTextContent('true');
      expect(screen.getByTestId('is-club-admin')).toHaveTextContent('false');
      expect(screen.getByTestId('is-site-admin')).toHaveTextContent('false');
      
      // Secretary capabilities
      expect(screen.getByTestId('can-view-all-dogs')).toHaveTextContent('true');
      expect(screen.getByTestId('can-register-any-dog')).toHaveTextContent('true');
      expect(screen.getByTestId('can-create-exhibitor')).toHaveTextContent('false'); // Default secretary
      expect(screen.getByTestId('can-override-fees')).toHaveTextContent('false');
      expect(screen.getByTestId('can-assign-armbands')).toHaveTextContent('true');
      expect(screen.getByTestId('can-manage-status')).toHaveTextContent('true');
      expect(screen.getByTestId('can-bulk-operations')).toHaveTextContent('true');
      
      // Secretary workflow
      expect(screen.getByTestId('registration-mode')).toHaveTextContent('secretary_existing');
      expect(screen.getByTestId('max-dogs')).toHaveTextContent('50');
      expect(screen.getByTestId('can-use-advanced-search')).toHaveTextContent('true');
    });
  });

  describe('Club Admin Role', () => {
    beforeEach(() => {
      createTestScenario('clubadmin@example.com');
    });

    it('should have club admin permissions', () => {
      render(
        <TestWrapper>
          <PermissionTestComponent />
        </TestWrapper>
      );

      expect(screen.getByTestId('roles')).toHaveTextContent('club_admin');
      expect(screen.getByTestId('is-exhibitor')).toHaveTextContent('false');
      expect(screen.getByTestId('is-secretary')).toHaveTextContent('false');
      expect(screen.getByTestId('is-club-admin')).toHaveTextContent('true');
      expect(screen.getByTestId('is-site-admin')).toHaveTextContent('false');
      
      // Club admin capabilities
      expect(screen.getByTestId('can-view-all-dogs')).toHaveTextContent('true');
      expect(screen.getByTestId('can-register-any-dog')).toHaveTextContent('true');
      expect(screen.getByTestId('can-create-exhibitor')).toHaveTextContent('true');
      expect(screen.getByTestId('can-override-fees')).toHaveTextContent('true');
      expect(screen.getByTestId('can-assign-armbands')).toHaveTextContent('true');
      expect(screen.getByTestId('can-manage-status')).toHaveTextContent('true');
      expect(screen.getByTestId('can-bulk-operations')).toHaveTextContent('true');
      
      // Club admin workflow
      expect(screen.getByTestId('registration-mode')).toHaveTextContent('secretary_new');
      expect(screen.getByTestId('max-dogs')).toHaveTextContent('100');
      expect(screen.getByTestId('can-use-advanced-search')).toHaveTextContent('true');
    });
  });

  describe('Site Admin Role', () => {
    beforeEach(() => {
      createTestScenario('admin@example.com');
    });

    it('should have full site admin permissions', () => {
      render(
        <TestWrapper>
          <PermissionTestComponent />
        </TestWrapper>
      );

      expect(screen.getByTestId('roles')).toHaveTextContent('site_admin');
      expect(screen.getByTestId('is-exhibitor')).toHaveTextContent('false');
      expect(screen.getByTestId('is-secretary')).toHaveTextContent('false');
      expect(screen.getByTestId('is-club-admin')).toHaveTextContent('false');
      expect(screen.getByTestId('is-site-admin')).toHaveTextContent('true');
      
      // Site admin capabilities (all permissions)
      expect(screen.getByTestId('can-view-all-dogs')).toHaveTextContent('true');
      expect(screen.getByTestId('can-register-any-dog')).toHaveTextContent('true');
      expect(screen.getByTestId('can-create-exhibitor')).toHaveTextContent('true');
      expect(screen.getByTestId('can-override-fees')).toHaveTextContent('true');
      expect(screen.getByTestId('can-assign-armbands')).toHaveTextContent('true');
      expect(screen.getByTestId('can-manage-status')).toHaveTextContent('true');
      expect(screen.getByTestId('can-bulk-operations')).toHaveTextContent('true');
      
      // Site admin workflow
      expect(screen.getByTestId('registration-mode')).toHaveTextContent('secretary_new');
      expect(screen.getByTestId('max-dogs')).toHaveTextContent('1000');
      expect(screen.getByTestId('can-use-advanced-search')).toHaveTextContent('true');
    });
  });

  describe('Scoped Permissions', () => {
    it('should respect club scopes for secretary role', () => {
      const ScopeTestComponent = () => {
        const { hasScope, getScopedClubs, canRegisterForShow } = useRegistrationPermissions();
        
        return (
          <div>
            <div data-testid="has-club-1-scope">
              {hasScope(ScopeType.CLUB, 'club-1').toString()}
            </div>
            <div data-testid="has-club-2-scope">
              {hasScope(ScopeType.CLUB, 'club-2').toString()}
            </div>
            <div data-testid="scoped-clubs">{getScopedClubs().join(',')}</div>
            <div data-testid="can-register-show-1">
              {canRegisterForShow('show-1', 'club-1').toString()}
            </div>
            <div data-testid="can-register-show-2">
              {canRegisterForShow('show-2', 'club-2').toString()}
            </div>
          </div>
        );
      };

      createTestScenario('secretary@example.com');
      
      render(
        <TestWrapper>
          <ScopeTestComponent />
        </TestWrapper>
      );

      // Secretary should have scope for club-1 only (from mock data)
      expect(screen.getByTestId('has-club-1-scope')).toHaveTextContent('true');
      expect(screen.getByTestId('has-club-2-scope')).toHaveTextContent('false');
      expect(screen.getByTestId('scoped-clubs')).toHaveTextContent('club-1');
      expect(screen.getByTestId('can-register-show-1')).toHaveTextContent('true');
      expect(screen.getByTestId('can-register-show-2')).toHaveTextContent('false');
    });
  });

  describe('Dog Filtering by Role', () => {
    it('should filter dogs correctly for different roles', () => {
      const FilterTestComponent = () => {
        const { filterAccessibleDogs } = useRegistrationPermissions();
        
        const allDogs = [
          { id: 'dog-1', ownerId: 'test-user', clubId: 'club-1' },
          { id: 'dog-2', ownerId: 'other-user', clubId: 'club-1' },
          { id: 'dog-3', ownerId: 'test-user', clubId: 'club-2' },
          { id: 'dog-4', ownerId: 'other-user', clubId: 'club-2' },
          { id: 'dog-5', ownerId: 'another-user', clubId: 'club-3' }
        ];
        
        const accessibleDogs = filterAccessibleDogs(allDogs);
        
        return (
          <div>
            <div data-testid="accessible-count">{accessibleDogs.length}</div>
            <div data-testid="accessible-dogs">
              {accessibleDogs.map(dog => dog.id).sort().join(',')}
            </div>
          </div>
        );
      };

      // Test exhibitor filtering (own dogs only)
      createTestScenario('exhibitor@example.com');
      const { rerender } = render(
        <TestWrapper>
          <FilterTestComponent />
        </TestWrapper>
      );
      
      expect(screen.getByTestId('accessible-count')).toHaveTextContent('2');
      expect(screen.getByTestId('accessible-dogs')).toHaveTextContent('dog-1,dog-3');

      // Test secretary filtering (scoped to club-1)
      createTestScenario('secretary@example.com');
      rerender(
        <TestWrapper>
          <FilterTestComponent />
        </TestWrapper>
      );
      
      // Secretary should see own dogs + club-1 dogs
      expect(screen.getByTestId('accessible-count')).toHaveTextContent('3');
      expect(screen.getByTestId('accessible-dogs')).toHaveTextContent('dog-1,dog-2,dog-3');

      // Test site admin filtering (all dogs)
      createTestScenario('admin@example.com');
      rerender(
        <TestWrapper>
          <FilterTestComponent />
        </TestWrapper>
      );
      
      expect(screen.getByTestId('accessible-count')).toHaveTextContent('5');
      expect(screen.getByTestId('accessible-dogs')).toHaveTextContent('dog-1,dog-2,dog-3,dog-4,dog-5');
    });
  });
});