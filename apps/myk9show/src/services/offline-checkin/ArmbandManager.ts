/**
 * Armband Manager
 * 
 * Handles armband assignment, conflict detection and resolution,
 * and ensures unique armband assignments across classes.
 */

import { EventEmitter } from '../sync/eventEmitter';
import { getOptimalStorage } from '../database/storage-adapter';
import type { StateStorage } from 'zustand/middleware';
import { logger } from '@/services/LoggingService';
import type {
  ArmbandAssignment,
  ArmbandConflict,
  ArmbandConflictResolution,
  ArmbandManagerConfig,
  CheckInEntry,
  CheckInEvent,
  CheckInEventType
} from '@/types/offline-checkin-types';
import { generateId } from '@/utils/idUtils';

const DEFAULT_CONFIG: ArmbandManagerConfig = {
  autoAssignArmbands: true,
  allowDuplicates: false,
  conflictResolutionStrategy: 'reassign',
  armbandRanges: [
    { start: 1, end: 999 }
  ],
  reservedArmbands: []
};

export class ArmbandManager extends EventEmitter {
  private config: ArmbandManagerConfig;
  private storage: StateStorage;
  private assignments: Map<string, ArmbandAssignment> = new Map();
  private conflicts: Map<string, ArmbandConflict> = new Map();
  private isInitialized = false;

  constructor(config: Partial<ArmbandManagerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.storage = getOptimalStorage('armbands');
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.loadPersistedData();
      this.isInitialized = true;
      this.emit('initialized', {});
      logger.debug('ArmbandManager initialized successfully', 'services', {});
    } catch (error) {
      logger.error('Failed to initialize ArmbandManager:', 'services', {}, error as Error);
      throw error;
    }
  }

  // Armband assignment
  async assignArmband(
    entryId: string,
    classId: string,
    showId: string,
    preferredArmband?: string,
    assignedBy?: string
  ): Promise<ArmbandAssignment> {
    try {
      let armband: string;

      if (preferredArmband) {
        // Check if preferred armband is available
        const isAvailable = await this.isArmbandAvailable(preferredArmband, classId);
        if (isAvailable) {
          armband = preferredArmband;
        } else if (!this.config.allowDuplicates) {
          throw new Error(`Armband ${preferredArmband} is not available for class ${classId}`);
        } else {
          armband = preferredArmband;
        }
      } else {
        // Auto-assign next available armband
        armband = await this.getNextAvailableArmband(classId);
      }

      // Create assignment
      const assignment: ArmbandAssignment = {
        id: generateId(),
        showId,
        classId,
        armband,
        entryId,
        status: 'assigned',
        assignedAt: new Date(),
        assignedBy: assignedBy || 'system',
        createdAt: new Date(),
        updatedAt: new Date(),
        _sync: {
          _version: 1,
          _lastModified: new Date().toISOString(),
          _lastModifiedBy: assignedBy || 'system',
          _syncStatus: 'pending'
        }
      };

      // Check for conflicts
      const existingAssignment = await this.findAssignmentByArmband(armband, classId);
      if (existingAssignment && existingAssignment.entryId !== entryId) {
        if (!this.config.allowDuplicates) {
          await this.handleArmbandConflict(assignment);
        }
      }

      this.assignments.set(assignment.id, assignment);
      await this.persistData();

      this.emitEvent('armband_assigned', {
        assignmentId: assignment.id,
        entryId,
        armband,
        classId,
        assignedBy: assignedBy || 'system'
      });

      return assignment;
    } catch (error) {
      this.emitEvent('armband_assignment_failed', {
        entryId,
        classId,
        preferredArmband,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async reassignArmband(
    assignmentId: string,
    newArmband: string,
    reassignedBy: string
  ): Promise<ArmbandAssignment> {
    const assignment = this.assignments.get(assignmentId);
    if (!assignment) {
      throw new Error(`Assignment ${assignmentId} not found`);
    }

    // Check if new armband is available
    const isAvailable = await this.isArmbandAvailable(newArmband, assignment.classId);
    if (!isAvailable && !this.config.allowDuplicates) {
      throw new Error(`Armband ${newArmband} is not available for class ${assignment.classId}`);
    }

    const originalArmband = assignment.armband;
    assignment.armband = newArmband;
    assignment.assignedAt = new Date();
    assignment.assignedBy = reassignedBy;
    assignment.updatedAt = new Date();
    
    // Update sync metadata
    if (!assignment._sync) {
      assignment._sync = {
        _version: 1,
        _lastModified: new Date().toISOString(),
        _lastModifiedBy: reassignedBy,
        _syncStatus: 'pending'
      };
    } else {
      assignment._sync._version++;
      assignment._sync._lastModified = new Date().toISOString();
      assignment._sync._lastModifiedBy = reassignedBy;
      assignment._sync._syncStatus = 'pending';
    }

    this.assignments.set(assignmentId, assignment);
    await this.persistData();

    this.emitEvent('armband_reassigned', {
      assignmentId,
      entryId: assignment.entryId,
      originalArmband,
      newArmband,
      classId: assignment.classId,
      reassignedBy
    });

    return assignment;
  }

  async releaseArmband(assignmentId: string, releasedBy: string): Promise<void> {
    const assignment = this.assignments.get(assignmentId);
    if (!assignment) {
      throw new Error(`Assignment ${assignmentId} not found`);
    }

    assignment.status = 'available';
    assignment.entryId = undefined;
    assignment.updatedAt = new Date();
    
    // Update sync metadata
    if (!assignment._sync) {
      assignment._sync = {
        _version: 1,
        _lastModified: new Date().toISOString(),
        _lastModifiedBy: releasedBy,
        _syncStatus: 'pending'
      };
    } else {
      assignment._sync._version++;
      assignment._sync._lastModified = new Date().toISOString();
      assignment._sync._lastModifiedBy = releasedBy;
      assignment._sync._syncStatus = 'pending';
    }

    this.assignments.set(assignmentId, assignment);
    await this.persistData();

    this.emitEvent('armband_released', {
      assignmentId,
      armband: assignment.armband,
      classId: assignment.classId,
      releasedBy
    });
  }

  // Conflict detection and resolution
  async detectConflicts(classId?: string): Promise<ArmbandConflict[]> {
    const conflicts: ArmbandConflict[] = [];
    const armbandMap = new Map<string, ArmbandAssignment[]>();

    // Group assignments by armband within each class
    const relevantAssignments = Array.from(this.assignments.values())
      .filter(a => a.status === 'assigned' && (!classId || a.classId === classId));

    for (const assignment of relevantAssignments) {
      const key = `${assignment.classId}-${assignment.armband}`;
      if (!armbandMap.has(key)) {
        armbandMap.set(key, []);
      }
      armbandMap.get(key)!.push(assignment);
    }

    // Find conflicts (multiple assignments for same armband in same class)
    for (const [key, assignments] of armbandMap.entries()) {
      if (assignments.length > 1) {
        const [classId, armband] = key.split('-');
        
        // Create mock entries for conflict resolution
        const conflictingEntries: CheckInEntry[] = assignments.map(a => ({
          id: a.entryId!,
          armband,
          classId,
          showId: a.showId,
          // Add other required fields with default values
          trialId: '',
          dogId: '',
          handlerId: '',
          runOrder: 0,
          entryNumber: '',
          dogName: '',
          dogCallName: '',
          dogBreed: '',
          handlerName: '',
          className: '',
          classNumber: '',
          ringNumber: 0,
          judgeName: '',
          checkInStatus: 'none',
          createdAt: new Date(),
          updatedAt: new Date(),
          _sync: {
            _version: 1,
            _lastModified: new Date().toISOString(),
            _lastModifiedBy: 'system',
            _syncStatus: 'pending'
          }
        }));

        conflicts.push({
          id: generateId(),
          armband,
          classId,
          conflictingEntries,
          conflictType: 'duplicate_assignment',
          detectedAt: new Date()
        });
      }
    }

    return conflicts;
  }

  async resolveConflict(
    conflictId: string,
    resolution: ArmbandConflictResolution,
    resolvedBy: string
  ): Promise<void> {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict) {
      throw new Error(`Conflict ${conflictId} not found`);
    }

    try {
      switch (resolution.strategy) {
        case 'reassign_duplicates':
          await this.resolveByReassigning(conflict, resolution, resolvedBy);
          break;
        case 'keep_first':
          await this.resolveByKeepingFirst(conflict, resolvedBy);
          break;
        case 'manual_assignment':
          await this.resolveManually(conflict, resolution, resolvedBy);
          break;
        case 'new_armbands':
          await this.resolveWithNewArmbands(conflict, resolution, resolvedBy);
          break;
        default:
          throw new Error(`Unknown resolution strategy: ${resolution.strategy}`);
      }

      conflict.resolvedAt = new Date();
      conflict.resolution = resolution;
      conflict.resolvedBy = resolvedBy;

      this.conflicts.set(conflictId, conflict);
      await this.persistData();

      this.emitEvent('armband_conflict_resolved', {
        conflictId,
        strategy: resolution.strategy,
        resolvedBy
      });
    } catch (error) {
      throw new Error(`Failed to resolve conflict: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Query methods
  async getAssignmentsForClass(classId: string): Promise<ArmbandAssignment[]> {
    return Array.from(this.assignments.values()).filter(a => a.classId === classId);
  }

  async getAssignmentsForShow(showId: string): Promise<ArmbandAssignment[]> {
    return Array.from(this.assignments.values()).filter(a => a.showId === showId);
  }

  async getAssignmentByEntry(entryId: string): Promise<ArmbandAssignment | null> {
    return Array.from(this.assignments.values()).find(a => a.entryId === entryId) || null;
  }

  async getAvailableArmbands(classId: string, range?: { start: number; end: number }): Promise<string[]> {
    const assignments = await this.getAssignmentsForClass(classId);
    const usedArmbands = new Set(assignments.map(a => a.armband));
    const effectiveRange = range || this.config.armbandRanges[0];
    const available: string[] = [];

    for (let i = effectiveRange.start; i <= effectiveRange.end; i++) {
      const armband = i.toString();
      if (!usedArmbands.has(armband) && 
          !this.config.reservedArmbands.includes(armband)) {
        available.push(armband);
      }
    }

    return available;
  }

  // Bulk operations
  async bulkAssignArmbands(
    entries: { entryId: string; classId: string; showId: string; preferredArmband?: string }[],
    assignedBy: string
  ): Promise<{ successful: ArmbandAssignment[]; failed: { entryId: string; error: string }[] }> {
    const successful: ArmbandAssignment[] = [];
    const failed: { entryId: string; error: string }[] = [];

    for (const entry of entries) {
      try {
        const assignment = await this.assignArmband(
          entry.entryId,
          entry.classId,
          entry.showId,
          entry.preferredArmband,
          assignedBy
        );
        successful.push(assignment);
      } catch (error) {
        failed.push({
          entryId: entry.entryId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return { successful, failed };
  }

  async validateArmbandSequence(classId: string): Promise<{
    isValid: boolean;
    issues: string[];
    gaps: number[];
    duplicates: { armband: string; count: number }[];
  }> {
    const assignments = await this.getAssignmentsForClass(classId);
    const armbandNumbers = assignments
      .map(a => parseInt(a.armband))
      .filter(n => !isNaN(n))
      .sort((a, b) => a - b);

    const issues: string[] = [];
    const gaps: number[] = [];
    const duplicates: { armband: string; count: number }[] = [];

    // Check for gaps
    for (let i = 1; i < armbandNumbers.length; i++) {
      const current = armbandNumbers[i];
      const previous = armbandNumbers[i - 1];
      
      if (current - previous > 1) {
        for (let gap = previous + 1; gap < current; gap++) {
          gaps.push(gap);
        }
      }
    }

    // Check for duplicates
    const armbandCounts = new Map<string, number>();
    assignments.forEach(a => {
      armbandCounts.set(a.armband, (armbandCounts.get(a.armband) || 0) + 1);
    });

    for (const [armband, count] of armbandCounts.entries()) {
      if (count > 1) {
        duplicates.push({ armband, count });
      }
    }

    if (gaps.length > 0) {
      issues.push(`Found ${gaps.length} gaps in armband sequence`);
    }

    if (duplicates.length > 0) {
      issues.push(`Found ${duplicates.length} duplicate armbands`);
    }

    return {
      isValid: issues.length === 0,
      issues,
      gaps,
      duplicates
    };
  }

  // Private helper methods
  private async isArmbandAvailable(armband: string, classId: string): Promise<boolean> {
    const existingAssignment = await this.findAssignmentByArmband(armband, classId);
    return !existingAssignment || existingAssignment.status === 'available';
  }

  private async findAssignmentByArmband(armband: string, classId: string): Promise<ArmbandAssignment | null> {
    return Array.from(this.assignments.values()).find(
      a => a.armband === armband && a.classId === classId && a.status === 'assigned'
    ) || null;
  }

  private async getNextAvailableArmband(classId: string): Promise<string> {
    const availableArmbands = await this.getAvailableArmbands(classId);
    
    if (availableArmbands.length === 0) {
      throw new Error(`No available armbands for class ${classId}`);
    }

    // Return the lowest available number
    const numbers = availableArmbands.map(a => parseInt(a)).filter(n => !isNaN(n)).sort((a, b) => a - b);
    return numbers[0].toString();
  }

  private async handleArmbandConflict(
    newAssignment: ArmbandAssignment
  ): Promise<void> {
    const conflict: ArmbandConflict = {
      id: generateId(),
      armband: newAssignment.armband,
      classId: newAssignment.classId,
      conflictingEntries: [], // Will be populated with actual entries
      conflictType: 'duplicate_assignment',
      detectedAt: new Date()
    };

    this.conflicts.set(conflict.id, conflict);

    // Auto-resolve conflicts if strategy is not manual
    if (this.config.conflictResolutionStrategy !== 'manual') {
      const resolution: ArmbandConflictResolution = {
        strategy: this.config.conflictResolutionStrategy === 'reassign' ? 'reassign_duplicates' :
                 this.config.conflictResolutionStrategy === 'first_wins' ? 'keep_first' : 'manual_assignment',
        newAssignments: []
      };

      await this.resolveConflict(conflict.id, resolution, 'system');
    }

    this.emitEvent('armband_conflict', {
      conflictId: conflict.id,
      armband: newAssignment.armband,
      classId: newAssignment.classId
    });
  }

  private async resolveByReassigning(
    conflict: ArmbandConflict,
    _resolution: ArmbandConflictResolution,
    resolvedBy: string
  ): Promise<void> {
    // Keep first assignment, reassign others
    const assignments = Array.from(this.assignments.values()).filter(
      a => a.armband === conflict.armband && a.classId === conflict.classId
    );

    for (let i = 1; i < assignments.length; i++) {
      const assignment = assignments[i];
      const newArmband = await this.getNextAvailableArmband(assignment.classId);
      await this.reassignArmband(assignment.id, newArmband, resolvedBy);
    }
  }

  private async resolveByKeepingFirst(conflict: ArmbandConflict, resolvedBy: string): Promise<void> {
    const assignments = Array.from(this.assignments.values()).filter(
      a => a.armband === conflict.armband && a.classId === conflict.classId
    );

    // Remove all but the first assignment
    for (let i = 1; i < assignments.length; i++) {
      await this.releaseArmband(assignments[i].id, resolvedBy);
    }
  }

  private async resolveManually(
    _conflict: ArmbandConflict,
    resolution: ArmbandConflictResolution,
    resolvedBy: string
  ): Promise<void> {
    // Apply manual assignments from resolution
    for (const newAssignment of resolution.newAssignments) {
      const assignment = await this.getAssignmentByEntry(newAssignment.entryId);
      if (assignment) {
        await this.reassignArmband(assignment.id, newAssignment.armband, resolvedBy);
      }
    }
  }

  private async resolveWithNewArmbands(
    conflict: ArmbandConflict,
    _resolution: ArmbandConflictResolution,
    resolvedBy: string
  ): Promise<void> {
    const assignments = Array.from(this.assignments.values()).filter(
      a => a.armband === conflict.armband && a.classId === conflict.classId
    );

    // Assign new armbands to all conflicting entries
    for (const assignment of assignments) {
      const newArmband = await this.getNextAvailableArmband(assignment.classId);
      await this.reassignArmband(assignment.id, newArmband, resolvedBy);
    }
  }

  private emitEvent(type: CheckInEventType, data: Record<string, unknown>): void {
    const event: CheckInEvent = {
      type: type,
      timestamp: new Date(),
      data,
      source: 'service',
      priority: 'medium'
    };
    
    this.emit('armband-event', event);
  }

  // Persistence
  private async persistData(): Promise<void> {
    try {
      const data = {
        assignments: Array.from(this.assignments.entries()),
        conflicts: Array.from(this.conflicts.entries()),
        config: this.config
      };
      
      await this.storage.setItem('armband-manager-data', JSON.stringify(data));
    } catch (error) {
      logger.error('Failed to persist armband data:', 'services', {}, error as Error);
    }
  }

  private async loadPersistedData(): Promise<void> {
    try {
      const dataStr = await this.storage.getItem('armband-manager-data');
      if (!dataStr) return;

      const data = JSON.parse(dataStr);
      
      if (data.assignments) {
        this.assignments = new Map(data.assignments);
      }
      
      if (data.conflicts) {
        this.conflicts = new Map(data.conflicts);
      }
      
      if (data.config) {
        this.config = { ...this.config, ...data.config };
      }
    } catch (error) {
      logger.error('Failed to load persisted armband data:', 'services', {}, error as Error);
    }
  }
}

// Export singleton instance
export const armbandManager = new ArmbandManager();