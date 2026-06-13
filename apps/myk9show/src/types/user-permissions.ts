/**
 * User permissions and role-based access control types
 */

export type UserRole = 'secretary' | 'judge' | 'admin' | 'steward' | 'exhibitor';

export interface UserPermissions {
  // Entry management permissions
  canViewEntries: boolean;
  canEditEntries: boolean;
  canDeleteEntries: boolean;
  canAddEntries: boolean;

  // Result management permissions
  canEditResults: boolean;
  canViewResults: boolean;
  canSubmitResults: boolean;

  // Bulk operations
  canBulkEdit: boolean;
  canImportData: boolean;
  canExportData: boolean;

  // Advanced features
  canAccessAdvancedFeatures: boolean;
  canManageClass: boolean;
  canViewStatistics: boolean;

  // User identification
  role: UserRole;
  userId?: string | undefined;
  displayName?: string | undefined;
}

/**
 * Role-based permission configurations
 */
export const ROLE_PERMISSIONS: Record<
  UserRole,
  Omit<UserPermissions, 'role' | 'userId' | 'displayName'>
> = {
  // Exhibitors can only view their own entries
  exhibitor: {
    canViewEntries: true,
    canEditEntries: false,
    canDeleteEntries: false,
    canAddEntries: false,
    canEditResults: false,
    canViewResults: true,
    canSubmitResults: false,
    canBulkEdit: false,
    canImportData: false,
    canExportData: false,
    canAccessAdvancedFeatures: false,
    canManageClass: false,
    canViewStatistics: false,
  },

  // Stewards can view and make basic edits
  steward: {
    canViewEntries: true,
    canEditEntries: true,
    canDeleteEntries: false,
    canAddEntries: true,
    canEditResults: true,
    canViewResults: true,
    canSubmitResults: false,
    canBulkEdit: false,
    canImportData: false,
    canExportData: false,
    canAccessAdvancedFeatures: false,
    canManageClass: false,
    canViewStatistics: true,
  },

  // Judges can enter results but not manage entries
  judge: {
    canViewEntries: true,
    canEditEntries: false,
    canDeleteEntries: false,
    canAddEntries: false,
    canEditResults: true,
    canViewResults: true,
    canSubmitResults: true,
    canBulkEdit: true,
    canImportData: false,
    canExportData: true,
    canAccessAdvancedFeatures: true,
    canManageClass: false,
    canViewStatistics: true,
  },

  // Secretaries have full entry and result management
  secretary: {
    canViewEntries: true,
    canEditEntries: true,
    canDeleteEntries: true,
    canAddEntries: true,
    canEditResults: true,
    canViewResults: true,
    canSubmitResults: true,
    canBulkEdit: true,
    canImportData: true,
    canExportData: true,
    canAccessAdvancedFeatures: true,
    canManageClass: true,
    canViewStatistics: true,
  },

  // Admins have all permissions
  admin: {
    canViewEntries: true,
    canEditEntries: true,
    canDeleteEntries: true,
    canAddEntries: true,
    canEditResults: true,
    canViewResults: true,
    canSubmitResults: true,
    canBulkEdit: true,
    canImportData: true,
    canExportData: true,
    canAccessAdvancedFeatures: true,
    canManageClass: true,
    canViewStatistics: true,
  },
};

/**
 * Create user permissions object from role
 */
export const createUserPermissions = (
  role: UserRole,
  userId?: string,
  displayName?: string
): UserPermissions => {
  return {
    ...ROLE_PERMISSIONS[role],
    role,
    userId,
    displayName,
  };
};

/**
 * Check if user has specific permission
 */
export const hasPermission = (
  permissions: UserPermissions,
  permission: keyof Omit<UserPermissions, 'role' | 'userId' | 'displayName'>
): boolean => {
  return permissions[permission];
};

/**
 * Check if feature should be visible based on permissions
 */
export const shouldShowFeature = (feature: string, permissions: UserPermissions): boolean => {
  switch (feature) {
    case 'delete':
      return permissions.canDeleteEntries;
    case 'edit':
      return permissions.canEditEntries;
    case 'add':
      return permissions.canAddEntries;
    case 'results':
      return permissions.canEditResults;
    case 'bulk-edit':
      return permissions.canBulkEdit;
    case 'import':
      return permissions.canImportData;
    case 'export':
      return permissions.canExportData;
    case 'statistics':
      return permissions.canViewStatistics;
    case 'advanced':
      return permissions.canAccessAdvancedFeatures;
    case 'manage-class':
      return permissions.canManageClass;
    default:
      return true;
  }
};

/**
 * Get role display information
 */
export const getRoleDisplayInfo = (role: UserRole) => {
  const roleInfo = {
    secretary: {
      label: 'Secretary',
      color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      description: 'Full access to entries and results management',
    },
    judge: {
      label: 'Judge',
      color: 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
      description: 'Can enter and submit results',
    },
    admin: {
      label: 'Administrator',
      color: 'bg-destructive/10 text-destructive ',
      description: 'Full system access',
    },
    steward: {
      label: 'Steward',
      color: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
      description: 'Can assist with basic entry management',
    },
    exhibitor: {
      label: 'Exhibitor',
      color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
      description: 'Can view own entries and results',
    },
  };

  return roleInfo[role];
};
