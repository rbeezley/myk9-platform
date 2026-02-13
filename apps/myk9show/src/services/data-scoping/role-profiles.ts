/**
 * Role-Based Data Scoping Profiles
 * 
 * Defines what data each user role needs access to, enabling efficient
 * data loading that only includes necessary information for each user type.
 * This prevents loading unnecessary data and improves performance.
 */

export interface DataScope {
  /** Stores that should be loaded immediately for this role */
  criticalStores: string[];
  /** Stores that can be lazy-loaded when needed */
  lazyStores: string[];
  /** Data filters to apply when loading */
  dataFilters: {
    dogs?: DataFilter;
    people?: DataFilter;
    shows?: DataFilter;
    classes?: DataFilter;
    registrations?: DataFilter;
    health?: DataFilter;
    templates?: DataFilter;
  };
  /** Pagination settings for lists */
  pagination: {
    dogs: number;
    people: number;
    shows: number;
    classes: number;
    registrations: number;
  };
}

export interface DataFilter {
  /** Only load records matching these conditions */
  where?: Record<string, unknown>;
  /** Only include these fields */
  select?: string[];
  /** Maximum number of records to load */
  limit?: number;
  /** Include related data */
  include?: string[];
  /** Exclude specific data */
  exclude?: string[];
}

/**
 * Secretary Role: Manages shows and registrations
 * - Needs active show data + all participants
 * - Requires class management and registration workflows
 * - Limited health record access (vaccination status only)
 */
export const SECRETARY_SCOPE: DataScope = {
  criticalStores: [
    'navigationStore',
    'showStore',
    'registrationStore',
  ],
  lazyStores: [
    'dogStore',
    'userStore',
    'classStore',
    'templateStore',
    'clubStore',
    'healthStore',
  ],
  dataFilters: {
    shows: {
      where: { status: ['draft', 'upcoming', 'active'] },
      include: ['trials', 'classes', 'registrations'],
      limit: 20,
    },
    dogs: {
      where: { 'registrations.showId': 'CURRENT_SHOW_ID' },
      include: ['registrations', 'basicHealth'],
      exclude: ['detailedHealthHistory', 'trainingRecords'],
    },
    people: {
      where: { 'dogs.registrations.showId': 'CURRENT_SHOW_ID' },
      include: ['contactInfo', 'dogs'],
      exclude: ['fullHealthRecords'],
    },
    classes: {
      where: { showId: 'CURRENT_SHOW_ID' },
      include: ['entries', 'schedule'],
    },
    registrations: {
      where: { showId: 'CURRENT_SHOW_ID' },
      include: ['dog', 'person', 'class'],
    },
    health: {
      select: ['vaccinationStatus', 'currentMedications'],
      where: { dogId: 'REGISTERED_DOGS_ONLY' },
    },
    templates: {
      where: { organizationType: ['AKC', 'UKC', 'COMMON'] },
      exclude: ['advancedRules', 'customizations'],
    },
  },
  pagination: {
    dogs: 50,
    people: 50,
    shows: 20,
    classes: 30,
    registrations: 100,
  },
};

/**
 * Judge Role: Evaluates classes and dogs
 * - Only needs assigned classes + entered dogs
 * - Requires judging tools and class management
 * - Limited show administration access
 */
export const JUDGE_SCOPE: DataScope = {
  criticalStores: [
    'navigationStore',
    'classStore',
    'judgingStore',
  ],
  lazyStores: [
    'dogStore',
    'userStore',
    'showStore',
    'registrationStore',
    'healthStore',
  ],
  dataFilters: {
    classes: {
      where: { judgeId: 'CURRENT_USER_ID' },
      include: ['entries', 'schedule', 'ring'],
    },
    dogs: {
      where: { 'registrations.classId': 'ASSIGNED_CLASSES' },
      include: ['basicInfo', 'registrations', 'owner'],
      exclude: ['detailedHealthHistory', 'trainingRecords'],
    },
    people: {
      where: { 'dogs.registrations.classId': 'ASSIGNED_CLASSES' },
      select: ['name', 'contactInfo', 'exhibitorNumber'],
      exclude: ['fullContactDetails', 'financialInfo'],
    },
    shows: {
      where: { 'classes.judgeId': 'CURRENT_USER_ID' },
      select: ['name', 'date', 'location', 'status'],
      include: ['assignedClasses'],
    },
    registrations: {
      where: { classId: 'ASSIGNED_CLASSES' },
      include: ['dog', 'person', 'class'],
    },
    health: {
      select: ['vaccinationStatus'],
      where: { dogId: 'ASSIGNED_DOGS_ONLY' },
    },
  },
  pagination: {
    dogs: 30,
    people: 30,
    shows: 10,
    classes: 15,
    registrations: 50,
  },
};

/**
 * Exhibitor Role: Manages own dogs and entries
 * - Only owns dogs + personal entries
 * - Limited access to show information
 * - Full health record access for owned dogs only
 */
export const EXHIBITOR_SCOPE: DataScope = {
  criticalStores: [
    'navigationStore',
    'dogStore',
    'registrationStore',
  ],
  lazyStores: [
    'userStore',
    'showStore',
    'classStore',
    'healthStore',
    'clubStore',
  ],
  dataFilters: {
    dogs: {
      where: { ownerId: 'CURRENT_USER_ID' },
      include: ['fullHealthRecords', 'trainingRecords', 'registrations'],
    },
    people: {
      where: { id: 'CURRENT_USER_ID' },
      include: ['fullContactDetails', 'dogs'],
    },
    shows: {
      where: { 'registrations.ownerId': 'CURRENT_USER_ID' },
      select: ['name', 'date', 'location', 'status', 'entryDeadline'],
      exclude: ['adminDetails', 'financialInfo'],
    },
    classes: {
      where: { 'registrations.ownerId': 'CURRENT_USER_ID' },
      include: ['schedule', 'judge', 'requirements'],
    },
    registrations: {
      where: { ownerId: 'CURRENT_USER_ID' },
      include: ['dog', 'class', 'show'],
    },
    health: {
      where: { dogId: 'OWNED_DOGS_ONLY' },
      include: ['fullRecords', 'vetContacts', 'medications'],
    },
  },
  pagination: {
    dogs: 20,
    people: 5,
    shows: 15,
    classes: 25,
    registrations: 30,
  },
};

/**
 * Admin Role: Full system access with intelligent pagination
 * - Access to all data but with smart pagination
 * - Performance-optimized views for large datasets
 * - System management and configuration access
 */
export const ADMIN_SCOPE: DataScope = {
  criticalStores: [
    'navigationStore',
    'adminStore',
  ],
  lazyStores: [
    'dogStore',
    'userStore',
    'showStore',
    'classStore',
    'registrationStore',
    'healthStore',
    'templateStore',
    'clubStore',
    'settingsStore',
    'analyticsStore',
  ],
  dataFilters: {
    dogs: {
      // Load in smaller batches for better performance
      limit: 100,
      include: ['owner', 'registrations', 'basicHealthSummary'],
      exclude: ['detailedTrainingRecords'],
    },
    people: {
      limit: 100,
      include: ['contactInfo', 'dogSummary'],
      exclude: ['sensitivePersonalInfo'],
    },
    shows: {
      limit: 50,
      include: ['basicInfo', 'statistics'],
    },
    classes: {
      limit: 100,
      include: ['basicInfo', 'entryCount'],
    },
    registrations: {
      limit: 200,
      include: ['basicInfo'],
    },
    health: {
      // Admin gets summary data, not full records
      select: ['dogId', 'vaccinationStatus', 'lastVetVisit'],
      limit: 200,
    },
    templates: {
      // Full template access for management
      include: ['fullConfiguration', 'usageStats'],
    },
  },
  pagination: {
    dogs: 50,
    people: 50,
    shows: 20,
    classes: 50,
    registrations: 100,
  },
};

/**
 * Get data scope configuration for a specific user role
 */
export function getDataScopeForRole(role: string): DataScope {
  switch (role.toLowerCase()) {
    case 'secretary':
      return SECRETARY_SCOPE;
    case 'judge':
      return JUDGE_SCOPE;
    case 'exhibitor':
      return EXHIBITOR_SCOPE;
    case 'admin':
    case 'administrator':
      return ADMIN_SCOPE;
    default:
      // Default to exhibitor scope for security
      return EXHIBITOR_SCOPE;
  }
}

/**
 * Check if a user role has access to specific data
 */
export function hasDataAccess(role: string, dataType: string, operation: 'read' | 'write' | 'delete'): boolean {
  const scope = getDataScopeForRole(role);

  const accessMatrix: Record<string, Record<string, string[]>> = {
    admin: {
      all: ['read', 'write', 'delete'],
    },
    secretary: {
      shows: ['read', 'write'],
      registrations: ['read', 'write'],
      classes: ['read', 'write'],
      dogs: ['read'],
      people: ['read'],
      templates: ['read'],
    },
    judge: {
      classes: ['read', 'write'],
      dogs: ['read'],
      people: ['read'],
      registrations: ['read'],
      judging: ['read', 'write'],
    },
    exhibitor: {
      dogs: ['read', 'write'],
      registrations: ['read', 'write'],
      people: ['read'],
      shows: ['read'],
      classes: ['read'],
    },
  };

  const roleAccess = accessMatrix[role.toLowerCase()];
  if (!roleAccess) return false;

  if (roleAccess[dataType]?.includes(operation)) return true;
  if (roleAccess.all?.includes(operation)) return true;

  if (operation === 'read') {
    const filter = scope.dataFilters[dataType as keyof typeof scope.dataFilters];
    if (filter) return true;

    const allStores = [...scope.criticalStores, ...scope.lazyStores];
    const storeNameVariants = [`${dataType}Store`, dataType];
    if (allStores.some(store => storeNameVariants.includes(store))) return true;
  }

  return false;
}

/**
 * Apply data filters based on role and context
 */
export function applyRoleDataFilter<T>(
  data: T[], 
  role: string, 
  dataType: string, 
  userId?: string,
  showId?: string
): T[] {
  const scope = getDataScopeForRole(role);
  const filter = scope.dataFilters[dataType as keyof typeof scope.dataFilters];
  
  if (!filter) return data;

  let filteredData = data;

  // Apply where conditions
  if (filter.where) {
    filteredData = filteredData.filter(item => {
      return Object.entries(filter.where!).every(([key, value]) => {
        // Handle special filter values
        if (value === 'CURRENT_USER_ID') value = userId;
        if (value === 'CURRENT_SHOW_ID') value = showId;
        
        // Get nested property value
        const itemValue = key.split('.').reduce((obj: Record<string, unknown>, k) => obj?.[k] as Record<string, unknown>, item as Record<string, unknown>);
        
        if (Array.isArray(value)) {
          return value.includes(itemValue);
        }
        return itemValue === value;
      });
    });
  }

  // Apply limit
  if (filter.limit) {
    filteredData = filteredData.slice(0, filter.limit);
  }

  return filteredData;
}

/**
 * Get pagination settings for a specific role and data type
 */
export function getPaginationForRole(role: string, dataType: string): number {
  const scope = getDataScopeForRole(role);
  return scope.pagination[dataType as keyof typeof scope.pagination] || 50;
}