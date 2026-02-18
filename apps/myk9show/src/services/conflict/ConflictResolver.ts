/**
 * ConflictResolver stub
 *
 * The real conflict resolution implementation lives in the @myk9/replication package.
 * This file exists solely to satisfy module resolution for tests while the local
 * implementation is pending. Tests that reference this module use vi.mock() and
 * describe.skip to avoid executing unimplemented code.
 *
 * TODO: Implement local ConflictResolver or re-export from @myk9/replication.
 */

export enum ConflictType {
  FIELD_CONFLICT = 'field_conflict',
  STRUCTURAL_CONFLICT = 'structural_conflict',
  DELETED_ENTITY = 'deleted_entity',
  CONCURRENT_UPDATE = 'concurrent_update',
}

export enum ConflictPriority {
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
  CRITICAL = 4,
}

export enum ResolutionStrategy {
  LAST_WRITE_WINS = 'last_write_wins',
  FIELD_MERGE = 'field_merge',
  MANUAL_REQUIRED = 'manual_required',
  CUSTOM_MERGE = 'custom_merge',
  BUSINESS_RULE_PRIORITY = 'business_rule_priority',
  USER_HIERARCHY = 'user_hierarchy',
}

export interface ConflictDetails {
  conflictType: ConflictType;
  priority: ConflictPriority;
  id: string;
  details: Array<{ conflictType: ConflictType; [key: string]: unknown }>;
  [key: string]: unknown;
}

export interface ConflictResolutionContext {
  userId: string;
  userRole: 'admin' | 'judge' | 'secretary' | 'exhibitor' | 'user';
  userPermissions: string[];
  timestamp: Date;
  deviceId: string;
}

export class ConflictResolver {
  async detectConflicts(
    _local: unknown,
    _remote: unknown,
    _base?: unknown
  ): Promise<ConflictDetails | null> {
    throw new Error('ConflictResolver.detectConflicts not implemented');
  }

  async resolveConflict(
    _conflict: ConflictDetails,
    _context: ConflictResolutionContext,
    _strategy?: ResolutionStrategy
  ): Promise<never> {
    throw new Error('ConflictResolver.resolveConflict not implemented');
  }

  async batchResolveConflicts(
    _conflicts: ConflictDetails[],
    _context: ConflictResolutionContext,
    _strategy?: ResolutionStrategy
  ): Promise<never> {
    throw new Error('ConflictResolver.batchResolveConflicts not implemented');
  }

  getConflictHistory(_entityType?: string, _entityId?: string, _limit?: number): unknown[] {
    throw new Error('ConflictResolver.getConflictHistory not implemented');
  }
}
