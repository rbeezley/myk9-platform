/**
 * Club Admin Service
 * Handles RBAC-based club admin assignments and permission management
 */

import { UserRole, RoleScope, ScopeType, UserWithRoles, MOCK_USERS, Permission } from '@/types/auth-types';
import { logger } from '@/services/LoggingService';

export interface ClubAdminAssignment {
  userId: string;
  clubId: string;
  assignedAt: Date;
  assignedBy: string;
}

export interface RoleAssignmentRequest {
  userId: string;
  clubId: string;
  role: UserRole;
  assignedBy: string;
}

/**
 * Service for managing club admin role assignments using RBAC
 */
export class ClubAdminService {
  /**
   * Assign club admin role to a user for a specific club
   */
  static assignClubAdmin(request: RoleAssignmentRequest): RoleScope {
    const roleScope: RoleScope = {
      userId: request.userId,
      roleId: UserRole.CLUB_ADMIN,
      scopeType: ScopeType.CLUB,
      scopeId: request.clubId,
      createdAt: new Date(),
      assignedAt: new Date(),
      assignedBy: request.assignedBy
    };

    // In a real application, this would persist to database
    // For now, we'll update the mock user data
    this.updateMockUserRoles(request.userId, roleScope);

    return roleScope;
  }

  /**
   * Remove club admin role from a user for a specific club
   */
  static removeClubAdmin(userId: string, clubId: string): boolean {
    // In a real application, this would remove from database
    // For now, we'll update the mock user data
    const mockUser = Object.values(MOCK_USERS).find(u => u.id === userId);
    if (mockUser) {
      // Remove the specific club scope
      mockUser.scopes = mockUser.scopes.filter(scope => 
        !(scope.scopeType === ScopeType.CLUB && scope.scopeId === clubId)
      );
      
      // If no more club admin scopes, remove the role
      const hasOtherClubScopes = mockUser.scopes.some(scope => 
        scope.scopeType === ScopeType.CLUB && scope.roleId === UserRole.CLUB_ADMIN
      );
      
      if (!hasOtherClubScopes) {
        mockUser.roles = mockUser.roles.filter(role => role !== UserRole.CLUB_ADMIN);
        // Remove club admin permissions
        mockUser.permissions = mockUser.permissions.filter(permission => 
          !['club:manage_members', 'club:edit_details', 'show:create', 'show:manage'].includes(permission)
        );
      }
      
      return true;
    }
    
    return false;
  }

  /**
   * Get all club admins for a specific club
   */
  static getClubAdmins(clubId: string): UserWithRoles[] {
    return Object.values(MOCK_USERS).filter(user => 
      user.scopes.some(scope => 
        scope.scopeType === ScopeType.CLUB && 
        scope.scopeId === clubId && 
        scope.roleId === UserRole.CLUB_ADMIN
      )
    );
  }

  /**
   * Check if a user is a club admin for a specific club
   */
  static isClubAdmin(userId: string, clubId: string): boolean {
    const mockUser = Object.values(MOCK_USERS).find(u => u.id === userId);
    if (!mockUser) return false;

    return mockUser.scopes.some(scope => 
      scope.scopeType === ScopeType.CLUB && 
      scope.scopeId === clubId && 
      scope.roleId === UserRole.CLUB_ADMIN
    );
  }

  /**
   * Get all clubs where a user is an admin
   */
  static getUserAdminClubs(userId: string): string[] {
    const mockUser = Object.values(MOCK_USERS).find(u => u.id === userId);
    if (!mockUser) return [];

    return mockUser.scopes
      .filter(scope => 
        scope.scopeType === ScopeType.CLUB && 
        scope.roleId === UserRole.CLUB_ADMIN
      )
      .map(scope => scope.scopeId);
  }

  /**
   * Transfer club admin role from one user to another
   */
  static transferClubAdmin(
    fromUserId: string, 
    toUserId: string, 
    clubId: string, 
    transferredBy: string
  ): boolean {
    try {
      // Remove from old admin
      this.removeClubAdmin(fromUserId, clubId);
      
      // Assign to new admin
      this.assignClubAdmin({
        userId: toUserId,
        clubId: clubId,
        role: UserRole.CLUB_ADMIN,
        assignedBy: transferredBy
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to transfer club admin:', 'services', {}, error as Error);
      return false;
    }
  }

  /**
   * Update mock user data with new role scope (for development)
   * In production, this would be handled by the database
   */
  private static updateMockUserRoles(userId: string, roleScope: RoleScope): void {
    const mockUser = Object.values(MOCK_USERS).find(u => u.id === userId);
    
    if (mockUser) {
      // Add role if not already present
      if (!mockUser.roles.includes(UserRole.CLUB_ADMIN)) {
        mockUser.roles.push(UserRole.CLUB_ADMIN);
        
        // Add club admin permissions
        const clubAdminPermissions = [
          'club:manage_members',
          'club:edit_details', 
          'show:create',
          'show:manage',
          'show:manage_entries',
          'registration:view_all_dogs',
          'registration:register_any',
          'user:read'
        ];
        
        // Add permissions that aren't already present
        clubAdminPermissions.forEach(permission => {
          if (!mockUser.permissions.includes(permission as Permission)) {
            mockUser.permissions.push(permission as Permission);
          }
        });
      }
      
      // Add scope if not already present
      const existingScope = mockUser.scopes.find(scope => 
        scope.scopeType === roleScope.scopeType && 
        scope.scopeId === roleScope.scopeId &&
        scope.roleId === roleScope.roleId
      );
      
      if (!existingScope) {
        mockUser.scopes.push(roleScope);
      }
    } else {
      logger.warn(`Mock user not found: ${userId}`, 'services', {});
    }
  }

  /**
   * Validate club admin assignment
   */
  static validateAssignment(userId: string, clubId: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    
    // Check if user exists
    const userExists = Object.values(MOCK_USERS).some(u => u.id === userId);
    if (!userExists) {
      errors.push('User does not exist');
    }
    
    // Check if club exists (would check database in real app)
    if (!clubId || clubId.trim() === '') {
      errors.push('Invalid club ID');
    }
    
    // Check if user is already an admin of this club
    if (this.isClubAdmin(userId, clubId)) {
      errors.push('User is already an admin of this club');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

/**
 * Hook to get club admin functionality
 */
export const useClubAdmin = () => {
  const assignClubAdmin = (userId: string, clubId: string, assignedBy: string) => {
    const validation = ClubAdminService.validateAssignment(userId, clubId);
    
    if (!validation.isValid) {
      throw new Error(`Cannot assign club admin: ${validation.errors.join(', ')}`);
    }
    
    return ClubAdminService.assignClubAdmin({
      userId,
      clubId,
      role: UserRole.CLUB_ADMIN,
      assignedBy
    });
  };

  const removeClubAdmin = (userId: string, clubId: string) => {
    return ClubAdminService.removeClubAdmin(userId, clubId);
  };

  const getClubAdmins = (clubId: string) => {
    return ClubAdminService.getClubAdmins(clubId);
  };

  const isClubAdmin = (userId: string, clubId: string) => {
    return ClubAdminService.isClubAdmin(userId, clubId);
  };

  const transferClubAdmin = (fromUserId: string, toUserId: string, clubId: string, transferredBy: string) => {
    return ClubAdminService.transferClubAdmin(fromUserId, toUserId, clubId, transferredBy);
  };

  return {
    assignClubAdmin,
    removeClubAdmin,
    getClubAdmins,
    isClubAdmin,
    transferClubAdmin
  };
};