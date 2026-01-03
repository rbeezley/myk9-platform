import { CreatedClass } from '../types/template.types';

export interface TimeSlot {
  startTime: Date;
  endTime: Date;
  duration: number; // minutes
}

export interface ScheduleItem extends CreatedClass {
  calculatedStartTime: Date;
  calculatedEndTime: Date;
  breakAfter: number; // minutes
  conflicts: ConflictInfo[];
}

export interface ConflictInfo {
  type: 'judge' | 'venue' | 'personnel' | 'equipment';
  severity: 'warning' | 'error';
  message: string;
  conflictingClass?: string;
  suggestions?: string[];
}

export interface ScheduleConfig {
  trialStartTime: Date;
  trialEndTime?: Date;
  defaultBreakDuration: number; // minutes
  lunchBreak?: {
    startTime: string; // HH:MM format
    duration: number; // minutes
  };
  maxConcurrentClasses?: number;
  judgeBreakRequirement?: number; // minutes between classes for same judge
}

export class TimeCalculationEngine {
  private config: ScheduleConfig;

  constructor(config: ScheduleConfig) {
    this.config = config;
  }

  /**
   * Calculate complete schedule with timing and conflict detection
   */
  calculateSchedule(classes: CreatedClass[]): ScheduleItem[] {
    // Sort classes by current run order
    const sortedClasses = [...classes].sort((a, b) => a.runOrder - b.runOrder);
    
    const schedule: ScheduleItem[] = [];
    let currentTime = new Date(this.config.trialStartTime);

    for (const cls of sortedClasses) {
      // Check if we need to add lunch break
      if (this.config.lunchBreak) {
        currentTime = this.handleLunchBreak(currentTime, (cls.fieldValues?.estimatedJudgingTime as number) || 15);
      }

      const startTime = new Date(currentTime);
      const endTime = new Date(startTime.getTime() + ((cls.fieldValues?.estimatedJudgingTime as number) || 15) * 60000);
      
      // Detect conflicts with existing schedule
      const conflicts = this.detectConflicts(cls, schedule, startTime, endTime);
      
      // Calculate break after this class
      const breakAfter = this.calculateBreakDuration(cls, sortedClasses, cls.runOrder);

      const scheduleItem: ScheduleItem = {
        ...cls,
        calculatedStartTime: startTime,
        calculatedEndTime: endTime,
        breakAfter,
        conflicts
      };

      schedule.push(scheduleItem);
      
      // Move to next class start time
      currentTime = new Date(endTime.getTime() + (breakAfter * 60000));
    }

    return schedule;
  }

  /**
   * Optimize schedule to minimize conflicts and improve efficiency
   */
  optimizeSchedule(classes: CreatedClass[]): CreatedClass[] {
    const optimized = [...classes];

    // Strategy 1: Group by element to minimize venue conflicts
    optimized.sort((a, b) => {
      // Primary: Group by element
      if (a.element !== b.element) {
        return a.element.localeCompare(b.element);
      }
      
      // Secondary: Order by level progression
      if (a.level && b.level && a.level !== b.level) {
        const levelOrder = ['Novice', 'Advanced', 'Excellent', 'Master'];
        return levelOrder.indexOf(a.level) - levelOrder.indexOf(b.level);
      }
      
      // Tertiary: Order by section
      if (a.section && b.section) {
        return a.section.localeCompare(b.section);
      }
      
      // Final: Alphabetical by class name
      return a.className.localeCompare(b.className);
    });

    // Strategy 2: Adjust for judge availability
    this.optimizeForJudges(optimized);

    // Update run orders
    return optimized.map((cls, index) => ({
      ...cls,
      runOrder: index + 1
    }));
  }

  /**
   * Detect potential scheduling conflicts
   */
  private detectConflicts(
    currentClass: CreatedClass,
    existingSchedule: ScheduleItem[],
    startTime: Date,
    endTime: Date
  ): ConflictInfo[] {
    const conflicts: ConflictInfo[] = [];

    for (const existingItem of existingSchedule) {
      // Check for time overlap
      const hasOverlap = startTime < existingItem.calculatedEndTime && 
                        endTime > existingItem.calculatedStartTime;

      if (!hasOverlap) continue;

      // Judge conflict
      if (currentClass.personnel.judgeId && 
          existingItem.personnel.judgeId === currentClass.personnel.judgeId) {
        conflicts.push({
          type: 'judge',
          severity: 'error',
          message: `Judge conflict with ${existingItem.className}`,
          conflictingClass: existingItem.className,
          suggestions: [
            'Assign different judge',
            'Reschedule one of the classes',
            'Add buffer time between classes'
          ]
        });
      }

      // Venue conflict (same element)
      if (currentClass.element === existingItem.element) {
        conflicts.push({
          type: 'venue',
          severity: 'error',
          message: `Venue conflict - both classes need ${currentClass.element} area`,
          conflictingClass: existingItem.className,
          suggestions: [
            'Schedule classes sequentially',
            'Use different venue areas if available'
          ]
        });
      }

      // Personnel conflict (shared stewards)
      const sharedPersonnel = this.findSharedPersonnel(currentClass, existingItem);
      if (sharedPersonnel.length > 0) {
        conflicts.push({
          type: 'personnel',
          severity: 'warning',
          message: `Personnel conflict - shared ${sharedPersonnel.join(', ')}`,
          conflictingClass: existingItem.className,
          suggestions: [
            'Assign different personnel',
            'Schedule classes sequentially'
          ]
        });
      }
    }

    // Check trial end time constraint
    if (this.config.trialEndTime && endTime > this.config.trialEndTime) {
      conflicts.push({
        type: 'venue',
        severity: 'error',
        message: 'Class extends beyond trial end time',
        suggestions: [
          'Move class to earlier time slot',
          'Reduce judging time estimate',
          'Extend trial duration'
        ]
      });
    }

    return conflicts;
  }

  /**
   * Calculate appropriate break duration between classes
   */
  private calculateBreakDuration(
    currentClass: CreatedClass,
    allClasses: CreatedClass[],
    currentRunOrder: number
  ): number {
    // Find the next class in the run order
    const nextClass = allClasses.find(cls => cls.runOrder === currentRunOrder + 1);
    if (!nextClass) return 0; // Last class

    let breakDuration = this.config.defaultBreakDuration;

    // Longer break if judge changes
    if (currentClass.personnel.judgeId !== nextClass.personnel.judgeId) {
      breakDuration = Math.max(breakDuration, 10);
    }

    // Longer break if element changes (venue setup)
    if (currentClass.element !== nextClass.element) {
      breakDuration = Math.max(breakDuration, 15);
    }

    // Judge break requirement
    if (this.config.judgeBreakRequirement && 
        currentClass.personnel.judgeId === nextClass.personnel.judgeId) {
      breakDuration = Math.max(breakDuration, this.config.judgeBreakRequirement);
    }

    return breakDuration;
  }

  /**
   * Handle lunch break insertion
   */
  private handleLunchBreak(currentTime: Date, nextClassDuration: number): Date {
    if (!this.config.lunchBreak) return currentTime;

    const lunchTime = this.parseLunchTime(currentTime, this.config.lunchBreak.startTime);
    const classEndTime = new Date(currentTime.getTime() + (nextClassDuration * 60000));

    // If current class would end after lunch time, insert lunch break now
    if (classEndTime > lunchTime && currentTime <= lunchTime) {
      return new Date(lunchTime.getTime() + (this.config.lunchBreak.duration * 60000));
    }

    return currentTime;
  }

  /**
   * Parse lunch time string into Date object
   */
  private parseLunchTime(baseDate: Date, timeString: string): Date {
    const [hours, minutes] = timeString.split(':').map(Number);
    const lunchDate = new Date(baseDate);
    lunchDate.setHours(hours, minutes, 0, 0);
    return lunchDate;
  }

  /**
   * Optimize schedule for judge availability
   */
  private optimizeForJudges(classes: CreatedClass[]): void {
    // Group classes by judge
    const judgeGroups = new Map<string, CreatedClass[]>();
    
    classes.forEach(cls => {
      if (cls.personnel.judgeId) {
        if (!judgeGroups.has(cls.personnel.judgeId)) {
          judgeGroups.set(cls.personnel.judgeId, []);
        }
        judgeGroups.get(cls.personnel.judgeId)!.push(cls);
      }
    });

    // For each judge, try to group their classes together
    judgeGroups.forEach((judgeClasses) => {
      if (judgeClasses.length > 1) {
        // Sort judge's classes by element and level to minimize setup time
        judgeClasses.sort((a, b) => {
          if (a.element !== b.element) {
            return a.element.localeCompare(b.element);
          }
          if (a.level && b.level) {
            const levelOrder = ['Novice', 'Advanced', 'Excellent', 'Master'];
            return levelOrder.indexOf(a.level) - levelOrder.indexOf(b.level);
          }
          return 0;
        });
      }
    });
  }

  /**
   * Find shared personnel between two classes
   */
  private findSharedPersonnel(class1: CreatedClass, class2: CreatedClass): string[] {
    const shared: string[] = [];

    // Check steward positions
    if (class1.personnel.stewards.gate && class2.personnel.stewards.gate && 
        class1.personnel.stewards.gate === class2.personnel.stewards.gate) {
      shared.push('Gate Steward');
    }

    if (class1.personnel.stewards.table && class2.personnel.stewards.table && 
        class1.personnel.stewards.table === class2.personnel.stewards.table) {
      shared.push('Table Steward');
    }

    if (class1.personnel.stewards.timer && class2.personnel.stewards.timer && 
        class1.personnel.stewards.timer === class2.personnel.stewards.timer) {
      shared.push('Timer');
    }

    // Check ring stewards
    const class1Ring = class1.personnel.stewards.ring || [];
    const class2Ring = class2.personnel.stewards.ring || [];
    const sharedRing = class1Ring.filter(steward => class2Ring.includes(steward));
    
    if (sharedRing.length > 0) {
      shared.push(`Ring Steward (${sharedRing.length})`);
    }

    return shared;
  }

  /**
   * Calculate total trial duration
   */
  getTotalDuration(schedule: ScheduleItem[]): number {
    if (schedule.length === 0) return 0;
    
    const start = schedule[0].calculatedStartTime;
    const end = schedule[schedule.length - 1].calculatedEndTime;
    
    return Math.round((end.getTime() - start.getTime()) / 60000); // minutes
  }

  /**
   * Get schedule statistics
   */
  getScheduleStats(schedule: ScheduleItem[]) {
    const totalConflicts = schedule.reduce((count, item) => count + item.conflicts.length, 0);
    const errorConflicts = schedule.reduce((count, item) => 
      count + item.conflicts.filter(c => c.severity === 'error').length, 0);
    const warningConflicts = totalConflicts - errorConflicts;
    
    const judgeCount = new Set(schedule.map(item => item.personnel.judgeId).filter(Boolean)).size;
    const elementCount = new Set(schedule.map(item => item.element)).size;
    
    return {
      totalClasses: schedule.length,
      totalDuration: this.getTotalDuration(schedule),
      totalConflicts,
      errorConflicts,
      warningConflicts,
      judgeCount,
      elementCount,
      startTime: schedule[0]?.calculatedStartTime,
      endTime: schedule[schedule.length - 1]?.calculatedEndTime
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ScheduleConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}