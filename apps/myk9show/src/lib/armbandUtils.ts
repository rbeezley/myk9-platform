import { ArmbandAssignment, ArmbandRange, useArmbandStore } from '@/store/armbandStore';
import { ClassSelectionData } from '@/types/show-registration-types';
import { Show } from '@/types/show-types';
import { logger } from '@/services/LoggingService';
// import { Trial } from '@/types/trial-types'; // TODO: Create trial types
interface Trial {
  id: string;
  name: string;
  trialDate: string;
  trialNumber?: string;
}

export interface ArmbandAssignmentOptions {
  showId: string;
  dogId: string;
  classSelections: ClassSelectionData[];
  show?: Show;
  trials?: Trial[];
  assignedBy: string;
  forceReassign?: boolean;
  preserveExisting?: boolean;
}

export interface BulkArmbandAssignmentOptions {
  showId: string;
  dogSelections: Array<{
    dogId: string;
    classSelections: ClassSelectionData[];
  }>;
  show?: Show;
  trials?: Trial[];
  assignedBy: string;
  startingNumber?: number;
  prefix?: string;
  assignmentStrategy?: 'sequential' | 'by-trial' | 'by-ring' | 'by-day';
}

export interface ArmbandValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions?: string[];
}

/**
 * Automatically assign armband numbers to a dog for all their classes
 * Ensures same armband number across all classes per day
 */
export function assignArmbandToDoǵ(options: ArmbandAssignmentOptions): ArmbandAssignment[] {
  const armbandStore = useArmbandStore.getState();
  const assignments: ArmbandAssignment[] = [];
  
  // Group classes by day
  const classesByDay = groupClassesByDay(options.classSelections, options.trials);
  
  for (const [dayNumber, classes] of classesByDay.entries()) {
    // Check if dog already has an armband for this day
    const existingAssignment = armbandStore.getAssignmentByShowAndDog(
      options.showId,
      options.dogId,
      dayNumber
    );
    
    if (existingAssignment && !options.forceReassign) {
      if (options.preserveExisting) {
        assignments.push(existingAssignment);
        continue;
      }
      // Otherwise, use the same armband number for consistency
      const assignment = armbandStore.assignArmband({
        showId: options.showId,
        dogId: options.dogId,
        armbandNumber: existingAssignment.armbandNumber,
        assignedBy: options.assignedBy,
        dayNumber,
        trialId: classes[0].trialId,
        ringId: getRingIdFromClasses()
      });
      assignments.push(assignment);
    } else {
      // Get next available number for this day
      const armbandNumber = armbandStore.getNextAvailableNumber(options.showId, {
        dayNumber,
        trialId: classes[0].trialId,
        ringId: getRingIdFromClasses()
      });
      
      const assignment = armbandStore.assignArmband({
        showId: options.showId,
        dogId: options.dogId,
        armbandNumber,
        assignedBy: options.assignedBy,
        dayNumber,
        trialId: classes[0].trialId,
        ringId: getRingIdFromClasses()
      });
      assignments.push(assignment);
    }
  }
  
  return assignments;
}

// Alias for better naming
export const assignArmbands = assignArmbandToDoǵ;

/**
 * Bulk assign armband numbers to multiple dogs
 */
export function assignArmbandsInBulk(options: BulkArmbandAssignmentOptions): Map<string, ArmbandAssignment[]> {
  // Determine assignment strategy
  switch (options.assignmentStrategy) {
    case 'by-trial':
      return assignByTrial(options);
    case 'by-ring':
      return assignByRing(options);
    case 'by-day':
      return assignByDay(options);
    case 'sequential':
    default:
      return assignSequentially(options);
  }
}

/**
 * Validate armband assignments for conflicts and issues
 */
export function validateArmbandAssignments(
  showId: string,
  assignments: ArmbandAssignment[]
): ArmbandValidation {
  const armbandStore = useArmbandStore.getState();
  const validation: ArmbandValidation = {
    isValid: true,
    errors: [],
    warnings: [],
    suggestions: []
  };
  
  // Check for duplicates within the provided assignments
  const armbandMap = new Map<string, ArmbandAssignment[]>();
  assignments.forEach(assignment => {
    const key = `${assignment.armbandNumber}-${assignment.dayNumber || 'all'}`;
    if (!armbandMap.has(key)) {
      armbandMap.set(key, []);
    }
    armbandMap.get(key)!.push(assignment);
  });
  
  // Check for conflicts
  armbandMap.forEach((assignments) => {
    if (assignments.length > 1) {
      validation.isValid = false;
      validation.errors.push(
        `Armband ${assignments[0].armbandNumber} is assigned to multiple dogs on day ${assignments[0].dayNumber || 'all'}`
      );
    }
  });
  
  // Check against existing assignments
  assignments.forEach(assignment => {
    const conflict = armbandStore.checkConflicts(
      showId,
      assignment.armbandNumber,
      assignment.dogId,
      {
        dayNumber: assignment.dayNumber,
        trialId: assignment.trialId,
        ringId: assignment.ringId
      }
    );
    
    if (conflict) {
      validation.warnings.push(conflict.reason);
    }
  });
  
  // Check range validity
  const ranges = armbandStore.getRangesByShow(showId);
  assignments.forEach(assignment => {
    const numberPart = parseInt(assignment.armbandNumber.replace(/\D/g, ''));
    const applicableRange = ranges.find(r => 
      (!r.trialId || r.trialId === assignment.trialId) &&
      (!r.ringId || r.ringId === assignment.ringId) &&
      (!r.dayNumber || r.dayNumber === assignment.dayNumber)
    );
    
    if (applicableRange && (numberPart < applicableRange.startNumber || numberPart > applicableRange.endNumber)) {
      validation.warnings.push(
        `Armband ${assignment.armbandNumber} is outside the defined range (${applicableRange.startNumber}-${applicableRange.endNumber})`
      );
    }
  });
  
  return validation;
}

/**
 * Create armband ranges for a show
 */
export function createArmbandRanges(
  showId: string,
  trials: Trial[],
  options?: {
    rangeSize?: number;
    startNumber?: number;
    prefix?: string;
    separateByTrial?: boolean;
    separateByRing?: boolean;
    separateByDay?: boolean;
  }
): ArmbandRange[] {
  const armbandStore = useArmbandStore.getState();
  const ranges: ArmbandRange[] = [];
  const rangeSize = options?.rangeSize || 100;
  let currentStart = options?.startNumber || 1;
  
  if (options?.separateByTrial) {
    trials.forEach((trial, index) => {
      const range = armbandStore.createRange({
        showId,
        trialId: trial.id,
        prefix: options?.prefix || trial.trialNumber || `T${index + 1}`,
        startNumber: currentStart,
        endNumber: currentStart + rangeSize - 1,
        description: `${trial.name} armband range`
      });
      ranges.push(range);
      currentStart += rangeSize;
    });
  } else {
    // Single range for the entire show
    const range = armbandStore.createRange({
      showId,
      prefix: options?.prefix || '',
      startNumber: currentStart,
      endNumber: currentStart + (rangeSize * trials.length) - 1,
      description: 'Show-wide armband range'
    });
    ranges.push(range);
  }
  
  return ranges;
}

/**
 * Helper function to group classes by day
 */
function groupClassesByDay(
  classSelections: ClassSelectionData[],
  trials?: Trial[]
): Map<number, ClassSelectionData[]> {
  const classesByDay = new Map<number, ClassSelectionData[]>();
  
  classSelections.forEach(selection => {
    // Determine day number from trial date or default to 1
    let dayNumber = 1;
    if (trials && selection.trialId) {
      const trial = trials.find(t => t.id === selection.trialId);
      if (trial && trial.trialDate) {
        // Calculate day number based on trial date
        // This is a simplified version - you might want to use actual date comparison
        dayNumber = new Date(trial.trialDate).getDay() || 1;
      }
    }
    
    if (!classesByDay.has(dayNumber)) {
      classesByDay.set(dayNumber, []);
    }
    classesByDay.get(dayNumber)!.push(selection);
  });
  
  return classesByDay;
}

/**
 * Helper function to extract ring ID from classes
 */
function getRingIdFromClasses(): string | undefined {
  // This is a placeholder - actual implementation would depend on your data structure
  // You might extract ring info from class data or trial data
  return undefined;
}

/**
 * Sequential assignment strategy
 */
function assignSequentially(options: BulkArmbandAssignmentOptions): Map<string, ArmbandAssignment[]> {
  const assignmentMap = new Map<string, ArmbandAssignment[]>();
  
  options.dogSelections.forEach(({ dogId, classSelections }) => {
    const assignments = assignArmbandToDoǵ({
      showId: options.showId,
      dogId,
      classSelections,
      show: options.show,
      trials: options.trials,
      assignedBy: options.assignedBy
    });
    assignmentMap.set(dogId, assignments);
  });
  
  return assignmentMap;
}

/**
 * Assignment by trial strategy
 */
function assignByTrial(options: BulkArmbandAssignmentOptions): Map<string, ArmbandAssignment[]> {
  // Group dogs by trial
  const dogsByTrial = new Map<string, string[]>();
  
  options.dogSelections.forEach(({ dogId, classSelections }) => {
    classSelections.forEach(selection => {
      if (selection.trialId) {
        if (!dogsByTrial.has(selection.trialId)) {
          dogsByTrial.set(selection.trialId, []);
        }
        if (!dogsByTrial.get(selection.trialId)!.includes(dogId)) {
          dogsByTrial.get(selection.trialId)!.push(dogId);
        }
      }
    });
  });
  
  // Assign numbers by trial
  const assignmentMap = new Map<string, ArmbandAssignment[]>();
  const armbandStore = useArmbandStore.getState();
  
  dogsByTrial.forEach((dogIds, trialId) => {
    const assignments = armbandStore.assignBulkArmbands(
      options.showId,
      dogIds,
      {
        trialId,
        prefix: options.prefix,
        startingNumber: options.startingNumber
      }
    );
    
    // Group assignments by dog
    assignments.forEach(assignment => {
      if (!assignmentMap.has(assignment.dogId)) {
        assignmentMap.set(assignment.dogId, []);
      }
      assignmentMap.get(assignment.dogId)!.push(assignment);
    });
  });
  
  return assignmentMap;
}

/**
 * Assignment by ring strategy
 */
function assignByRing(options: BulkArmbandAssignmentOptions): Map<string, ArmbandAssignment[]> {
  // Similar to assignByTrial but grouped by ring
  // Implementation depends on how ring information is stored
  return assignSequentially(options); // Fallback to sequential for now
}

/**
 * Assignment by day strategy
 */
function assignByDay(options: BulkArmbandAssignmentOptions): Map<string, ArmbandAssignment[]> {
  // Group dogs by day based on their class selections
  const dogsByDay = new Map<number, string[]>();
  
  options.dogSelections.forEach(({ dogId, classSelections }) => {
    const classesByDay = groupClassesByDay(classSelections, options.trials);
    classesByDay.forEach((classes, dayNumber) => {
      if (!dogsByDay.has(dayNumber)) {
        dogsByDay.set(dayNumber, []);
      }
      if (!dogsByDay.get(dayNumber)!.includes(dogId)) {
        dogsByDay.get(dayNumber)!.push(dogId);
      }
    });
  });
  
  // Assign numbers by day
  const assignmentMap = new Map<string, ArmbandAssignment[]>();
  const armbandStore = useArmbandStore.getState();
  
  dogsByDay.forEach((dogIds, dayNumber) => {
    const assignments = armbandStore.assignBulkArmbands(
      options.showId,
      dogIds,
      {
        dayNumber,
        prefix: options.prefix || `D${dayNumber}`,
        startingNumber: options.startingNumber
      }
    );
    
    // Group assignments by dog
    assignments.forEach(assignment => {
      if (!assignmentMap.has(assignment.dogId)) {
        assignmentMap.set(assignment.dogId, []);
      }
      assignmentMap.get(assignment.dogId)!.push(assignment);
    });
  });
  
  return assignmentMap;
}

/**
 * Export armband assignments to CSV format
 */
export function exportArmbandAssignmentsToCSV(assignments: ArmbandAssignment[]): string {
  const headers = ['Armband Number', 'Dog Name', 'Handler', 'Trial', 'Day', 'Ring', 'Assigned Date'];
  const rows = assignments.map(assignment => {
    // You would need to fetch dog and handler names from their respective stores
    return [
      assignment.armbandNumber,
      assignment.dogId, // Replace with actual dog name
      'Handler Name', // Replace with actual handler name
      assignment.trialId || '',
      assignment.dayNumber || '',
      assignment.ringId || '',
      new Date(assignment.assignedDate).toLocaleDateString()
    ];
  });
  
  return [headers, ...rows].map(row => row.join(',')).join('\n');
}

/**
 * Import armband assignments from CSV
 */
export function importArmbandAssignmentsFromCSV(
  csvContent: string,
  showId: string,
  assignedBy: string
): ArmbandAssignment[] {
  const lines = csvContent.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];
  
  const armbandStore = useArmbandStore.getState();
  const assignments: ArmbandAssignment[] = [];
  
  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const [armbandNumber, dogId, , trialId, dayNumber, ringId] = lines[i].split(',');
    
    if (armbandNumber && dogId) {
      try {
        const assignment = armbandStore.assignArmband({
          showId,
          dogId: dogId.trim(),
          armbandNumber: armbandNumber.trim(),
          assignedBy,
          trialId: trialId?.trim() || undefined,
          dayNumber: dayNumber ? parseInt(dayNumber.trim()) : undefined,
          ringId: ringId?.trim() || undefined
        });
        assignments.push(assignment);
      } catch (error) {
        logger.error(`Failed to import armband assignment for line ${i}:`, 'lib', {}, error as Error);
      }
    }
  }
  
  return assignments;
}