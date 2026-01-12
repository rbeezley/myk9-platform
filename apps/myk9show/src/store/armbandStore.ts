import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getOptimalStorage } from '@/services/database/storage-adapter';
import { logger } from '@/services/LoggingService';

export interface ArmbandAssignment {
  id: string;
  showId: string;
  trialId?: string;
  dogId: string;
  armbandNumber: string;
  assignedDate: string;
  assignedBy: string;
  // Support for multi-day shows
  dayNumber?: number;
  ringId?: string;
  // Conflict tracking
  conflicts?: string[];
  isManualOverride?: boolean;
}

export interface ArmbandRange {
  id: string;
  showId: string;
  trialId?: string;
  ringId?: string;
  prefix?: string;
  startNumber: number;
  endNumber: number;
  currentNumber: number;
  description?: string;
  // For specific days in multi-day shows
  dayNumber?: number;
}

export interface ArmbandConflict {
  armbandNumber: string;
  dogIds: string[];
  trialIds?: string[];
  ringIds?: string[];
  dayNumbers?: number[];
  reason: string;
}

interface ArmbandState {
  assignments: ArmbandAssignment[];
  ranges: ArmbandRange[];
  conflicts: ArmbandConflict[];
  
  // Assignment methods
  assignArmband: (assignment: Omit<ArmbandAssignment, 'id' | 'assignedDate'>) => ArmbandAssignment;
  assignBulkArmbands: (showId: string, dogIds: string[], options?: BulkAssignmentOptions) => ArmbandAssignment[];
  unassignArmband: (assignmentId: string) => void;
  updateAssignment: (assignmentId: string, update: Partial<ArmbandAssignment>) => void;
  
  // Range management
  createRange: (range: Omit<ArmbandRange, 'id' | 'currentNumber'>) => ArmbandRange;
  updateRange: (rangeId: string, update: Partial<ArmbandRange>) => void;
  deleteRange: (rangeId: string) => void;
  getNextAvailableNumber: (showId: string, options?: NumberOptions) => string;
  
  // Conflict detection
  checkConflicts: (showId: string, armbandNumber: string, dogId: string, options?: ConflictOptions) => ArmbandConflict | null;
  resolveConflict: (conflictId: string, resolution: ConflictResolution) => void;
  
  // Queries
  getAssignmentsByShow: (showId: string) => ArmbandAssignment[];
  getAssignmentsByDog: (dogId: string) => ArmbandAssignment[];
  getAssignmentByShowAndDog: (showId: string, dogId: string, dayNumber?: number) => ArmbandAssignment | undefined;
  getRangesByShow: (showId: string) => ArmbandRange[];
  getConflictsByShow: (showId: string) => ArmbandConflict[];
  
  // Utilities
  resetShowAssignments: (showId: string) => void;
  exportAssignments: (showId: string) => ExportData;
  importAssignments: (showId: string, data: ExportData) => void;
}

interface BulkAssignmentOptions {
  trialId?: string;
  ringId?: string;
  dayNumber?: number;
  startingNumber?: number;
  prefix?: string;
  skipConflictCheck?: boolean;
}

interface NumberOptions {
  trialId?: string;
  ringId?: string;
  dayNumber?: number;
  prefix?: string;
}

interface ConflictOptions {
  trialId?: string;
  ringId?: string;
  dayNumber?: number;
  checkAllDays?: boolean;
}

interface ConflictResolution {
  action: 'reassign' | 'swap' | 'override';
  targetDogId?: string;
  newArmbandNumber?: string;
}

interface ExportData {
  assignments: ArmbandAssignment[];
  ranges: ArmbandRange[];
  exportDate: string;
  showId: string;
}

export const useArmbandStore = create<ArmbandState>()(
  persist(
    (set, get) => ({
      assignments: [],
      ranges: [],
      conflicts: [],
      
      assignArmband: (assignment) => {
        const id = `armband_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newAssignment: ArmbandAssignment = {
          ...assignment,
          id,
          assignedDate: new Date().toISOString()
        };
        
        // Check for conflicts
        const conflict = get().checkConflicts(
          assignment.showId,
          assignment.armbandNumber,
          assignment.dogId,
          {
            trialId: assignment.trialId,
            ringId: assignment.ringId,
            dayNumber: assignment.dayNumber
          }
        );
        
        if (conflict && !assignment.isManualOverride) {
          throw new Error(`Armband conflict: ${conflict.reason}`);
        }
        
        set((state) => ({
          assignments: [...state.assignments, newAssignment],
          conflicts: conflict ? [...state.conflicts, conflict] : state.conflicts
        }));
        
        // Update range current number if applicable
        const range = get().ranges.find(r => 
          r.showId === assignment.showId &&
          r.trialId === assignment.trialId &&
          r.ringId === assignment.ringId &&
          r.dayNumber === assignment.dayNumber
        );
        
        if (range && !assignment.isManualOverride) {
          const numberPart = parseInt(assignment.armbandNumber.replace(range.prefix || '', ''));
          if (numberPart === range.currentNumber) {
            get().updateRange(range.id, { currentNumber: range.currentNumber + 1 });
          }
        }
        
        return newAssignment;
      },
      
      assignBulkArmbands: (showId, dogIds, options = {}) => {
        const assignments: ArmbandAssignment[] = [];
        const nextNumber = get().getNextAvailableNumber(showId, options);
        const startingNumber = options.startingNumber || 1;
        let currentNumber: number;
        if (typeof startingNumber === 'string') {
          currentNumber = parseInt((startingNumber as string).replace(options.prefix || '', ''));
        } else if (typeof startingNumber === 'number') {
          currentNumber = startingNumber;
        } else {
          currentNumber = parseInt((nextNumber as string).replace(options.prefix || '', ''));
        }
        
        dogIds.forEach((dogId) => {
          const armbandNumber = `${options.prefix || ''}${currentNumber}`;
          
          // Skip conflict check if requested (for faster bulk operations)
          if (!options.skipConflictCheck) {
            const conflict = get().checkConflicts(showId, armbandNumber, dogId, {
              trialId: options.trialId,
              ringId: options.ringId,
              dayNumber: options.dayNumber
            });
            
            if (conflict) {
              return;
            }
          }
          
          try {
            const assignment = get().assignArmband({
              showId,
              dogId,
              armbandNumber,
              assignedBy: 'system',
              trialId: options.trialId,
              ringId: options.ringId,
              dayNumber: options.dayNumber
            });
            assignments.push(assignment);
            currentNumber++;
          } catch (error) {
            logger.error(`Failed to assign armband to dog ${dogId}:`, 'store', {}, error as Error);
          }
        });
        
        return assignments;
      },
      
      unassignArmband: (assignmentId) => {
        set((state) => ({
          assignments: state.assignments.filter(a => a.id !== assignmentId)
        }));
      },
      
      updateAssignment: (assignmentId, update) => {
        set((state) => ({
          assignments: state.assignments.map(a =>
            a.id === assignmentId ? { ...a, ...update } : a
          )
        }));
      },
      
      createRange: (range) => {
        const id = `range_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newRange: ArmbandRange = {
          ...range,
          id,
          currentNumber: range.startNumber
        };
        
        set((state) => ({
          ranges: [...state.ranges, newRange]
        }));
        
        return newRange;
      },
      
      updateRange: (rangeId, update) => {
        set((state) => ({
          ranges: state.ranges.map(r =>
            r.id === rangeId ? { ...r, ...update } : r
          )
        }));
      },
      
      deleteRange: (rangeId) => {
        set((state) => ({
          ranges: state.ranges.filter(r => r.id !== rangeId)
        }));
      },
      
      getNextAvailableNumber: (showId, options = {}) => {
        const ranges = get().ranges.filter(r => 
          r.showId === showId &&
          (!options.trialId || r.trialId === options.trialId) &&
          (!options.ringId || r.ringId === options.ringId) &&
          (!options.dayNumber || r.dayNumber === options.dayNumber)
        );
        
        // Find the appropriate range
        const range = ranges[0] || {
          prefix: options.prefix || '',
          currentNumber: 1,
          endNumber: 9999
        };
        
        // Check if current number is already assigned
        const assignments = get().getAssignmentsByShow(showId);
        let nextNumber = range.currentNumber;
        let armbandNumber = `${range.prefix || ''}${nextNumber}`;
        
        while (assignments.some(a => a.armbandNumber === armbandNumber) && nextNumber <= range.endNumber) {
          nextNumber++;
          armbandNumber = `${range.prefix || ''}${nextNumber}`;
        }
        
        return armbandNumber;
      },
      
      checkConflicts: (showId, armbandNumber, dogId, options = {}) => {
        const assignments = get().assignments.filter(a => 
          a.showId === showId &&
          a.armbandNumber === armbandNumber &&
          a.dogId !== dogId
        );
        
        if (assignments.length === 0) return null;
        
        // Check specific conflict scenarios
        const conflictingAssignments = assignments.filter(a => {
          // Same day conflict
          if (options.dayNumber && a.dayNumber === options.dayNumber) return true;
          // Same trial conflict
          if (options.trialId && a.trialId === options.trialId) return true;
          // Same ring conflict
          if (options.ringId && a.ringId === options.ringId) return true;
          // Check all days if requested
          if (options.checkAllDays) return true;
          // Default: conflict if no specific options provided
          return !options.dayNumber && !options.trialId && !options.ringId;
        });
        
        if (conflictingAssignments.length === 0) return null;
        
        return {
          armbandNumber,
          dogIds: [dogId, ...conflictingAssignments.map(a => a.dogId)],
          trialIds: Array.from(new Set(conflictingAssignments.map(a => a.trialId).filter(Boolean))) as string[],
          ringIds: Array.from(new Set(conflictingAssignments.map(a => a.ringId).filter(Boolean))) as string[],
          dayNumbers: Array.from(new Set(conflictingAssignments.map(a => a.dayNumber).filter(Boolean))) as number[],
          reason: `Armband ${armbandNumber} is already assigned to ${conflictingAssignments.length} other dog(s)`
        };
      },
      
      resolveConflict: (_conflictId, _resolution) => {
        // TODO: Implement conflict resolution strategies
      },
      
      getAssignmentsByShow: (showId) => {
        return get().assignments.filter(a => a.showId === showId);
      },
      
      getAssignmentsByDog: (dogId) => {
        return get().assignments.filter(a => a.dogId === dogId);
      },
      
      getAssignmentByShowAndDog: (showId, dogId, dayNumber) => {
        return get().assignments.find(a => 
          a.showId === showId && 
          a.dogId === dogId &&
          (!dayNumber || a.dayNumber === dayNumber)
        );
      },
      
      getRangesByShow: (showId) => {
        return get().ranges.filter(r => r.showId === showId);
      },
      
      getConflictsByShow: (showId) => {
        return get().conflicts.filter(c => {
          // Check if conflict involves assignments from this show
          const assignments = get().assignments.filter(a => 
            a.showId === showId && c.dogIds.includes(a.dogId)
          );
          return assignments.length > 0;
        });
      },
      
      resetShowAssignments: (showId) => {
        set((state) => ({
          assignments: state.assignments.filter(a => a.showId !== showId),
          conflicts: state.conflicts.filter(c => {
            const showAssignments = state.assignments.filter(a => a.showId === showId);
            return !c.dogIds.some(dogId => showAssignments.some(a => a.dogId === dogId));
          })
        }));
      },
      
      exportAssignments: (showId) => {
        const assignments = get().getAssignmentsByShow(showId);
        const ranges = get().getRangesByShow(showId);
        
        return {
          assignments,
          ranges,
          exportDate: new Date().toISOString(),
          showId
        };
      },
      
      importAssignments: (showId, data) => {
        if (data.showId !== showId) {
          throw new Error('Show ID mismatch in import data');
        }
        
        // Clear existing assignments for this show
        get().resetShowAssignments(showId);
        
        // Import ranges
        data.ranges.forEach(range => {
          get().createRange(range);
        });
        
        // Import assignments
        data.assignments.forEach(assignment => {
          get().assignArmband(assignment);
        });
      }
    }),
    {
      name: 'armband-storage',
      storage: createJSONStorage(() => getOptimalStorage('armbands')),
      partialize: (state) => ({
        assignments: state.assignments,
        ranges: state.ranges,
        conflicts: state.conflicts,
      }),
      version: 1,
      migrate: (persistedState: unknown, version: number) => {
        // Handle version migrations for armband assignments
        if (version === 0) {
          // Convert from old format if necessary
          if (persistedState && typeof persistedState === 'object') {
            const state = persistedState as Record<string, unknown>;
            if (state.assignments && Array.isArray(state.assignments)) {
              // Ensure all assignments have proper relationships
              state.assignments = state.assignments.map((assignment: unknown) => {
                const a = assignment as Record<string, unknown>;
                return {
                  ...a,
                  // Add data transformations needed for relationships
                };
              });
            }
          }
        }
        return persistedState;
      },
    }
  )
);