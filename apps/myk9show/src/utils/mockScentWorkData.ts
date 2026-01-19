/**
 * Mock Scent Work Data Utilities
 * 
 * Generates realistic mock data for Scent Work judging interface development.
 * Provides consistent, deterministic data for testing and demonstration.
 */

import type { ScentWorkEntry, ScentWorkClassConfig } from '@/types/scent-work-types';
import type { CheckInStatus } from '@/types/check-in-types';
import { getTimeLimit, isMultiAreaClass, getAreaTimeLimits } from '@/types/scent-work-types';

// Mock dog breeds commonly seen in Scent Work
const COMMON_BREEDS = [
  'Border Collie', 'Golden Retriever', 'Labrador Retriever', 'German Shepherd',
  'Belgian Malinois', 'Australian Shepherd', 'Beagle', 'Bloodhound',
  'English Springer Spaniel', 'Cocker Spaniel', 'Poodle', 'Mixed Breed',
  'Jack Russell Terrier', 'Brittany', 'Pointer', 'Vizsla',
  'Nova Scotia Duck Tolling Retriever', 'Irish Setter', 'Weimaraner', 'Border Terrier'
];

// Mock handler names
const HANDLER_NAMES = [
  'Sarah Johnson', 'Mike Davis', 'Emma Wilson', 'James Brown', 'Lisa Miller',
  'David Garcia', 'Jennifer Taylor', 'Robert Anderson', 'Maria Rodriguez', 'William Jones',
  'Ashley Thompson', 'Christopher Lee', 'Amanda White', 'Daniel Harris', 'Jessica Clark',
  'Matthew Lewis', 'Stephanie Walker', 'Ryan Hall', 'Rachel Allen', 'Brandon Young'
];

// Mock dog names with variety
const DOG_NAMES = [
  'Max', 'Bella', 'Charlie', 'Luna', 'Cooper', 'Lucy', 'Buddy', 'Daisy',
  'Milo', 'Zoe', 'Bear', 'Stella', 'Tucker', 'Lola', 'Duke', 'Penny',
  'Zeus', 'Nala', 'Oliver', 'Ruby', 'Scout', 'Willow', 'Finn', 'Hazel',
  'Atlas', 'Ivy', 'Ranger', 'Sage', 'Storm', 'River', 'Phoenix', 'Aspen'
];

// Generate deterministic random number based on seed
function seededRandom(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash) / 2147483648; // Normalize to 0-1
}

// Generate a random element from array using seed
function seededChoice<T>(array: T[], seed: string): T {
  const index = Math.floor(seededRandom(seed) * array.length);
  return array[index];
}

// Generate check-in status based on entry index
function generateCheckInStatus(entryIndex: number): CheckInStatus {
  
  // Create some variety in check-in status
  if (entryIndex >= 8) {
    // Later entries (pending entries) mostly have no check-in status or some are checked in
    if (entryIndex % 3 === 0) return 'checked-in';
    if (entryIndex === 10) return 'conflict'; // Entry #110 has conflict
    return 'none';
  }
  
  // Earlier entries (completed/in-progress) are more likely to be checked in
  return 'checked-in';
}

// Generate random armband number (3-digit, starting from 100)
function generateArmband(entryIndex: number): string {
  return (100 + entryIndex).toString();
}

// Generate mock class configuration
function generateClassConfig(
  element: ScentWorkClassConfig['element'],
  level: ScentWorkClassConfig['level']
): ScentWorkClassConfig {
  const timeLimit = getTimeLimit(element, level);
  const multiArea = isMultiAreaClass(element, level);
  const areaLimits = multiArea ? getAreaTimeLimits(element, level) : undefined;
  
  return {
    element,
    level,
    timeLimit,
    multiArea,
    areaLimits,
    warningsEnabled: level !== 'Masters',
    hideCount: level === 'Masters' ? 'unknown' : 1
  };
}

// Generate mock display info for entry
function generateDisplayInfo(entryIndex: number, entryId: string) {
  const dogSeed = `dog-${entryId}`;
  const handlerSeed = `handler-${entryId}`;
  
  return {
    armband: generateArmband(entryIndex),
    dogName: seededChoice(DOG_NAMES, dogSeed),
    dogBreed: seededChoice(COMMON_BREEDS, `${dogSeed}-breed`),
    handlerName: seededChoice(HANDLER_NAMES, handlerSeed),
    dogId: `dog-${entryId}`,
    handlerId: `handler-${entryId}`
  };
}

// Generate base entry data
function generateBaseEntry(
  classId: string,
  entryIndex: number,
  config: {
    element: ScentWorkClassConfig['element'];
    level: ScentWorkClassConfig['level'];
  }
): ScentWorkEntry {
  const entryId = `entry-${classId}-${entryIndex.toString().padStart(3, '0')}`;
  const classConfig = generateClassConfig(config.element, config.level);
  const displayInfo = generateDisplayInfo(entryIndex, entryId);
  
  return {
    // Base ShowEntry properties
    id: entryId,
    showId: `show-${classId.split('-')[0]}`,
    classId,
    dogId: displayInfo.dogId,
    status: 'scheduled',
    
    registrationData: {
      submittedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000), // Within last week
      handler: displayInfo.handlerName,
      handlerId: displayInfo.handlerId,
      entryFee: 25.00,
      paymentStatus: 'paid',
      armband: displayInfo.armband,
      runOrder: entryIndex + 1
    },
    
    statusHistory: [
      {
        status: 'draft',
        timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        userId: displayInfo.handlerId
      },
      {
        status: 'submitted',
        timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
        userId: displayInfo.handlerId
      },
      {
        status: 'paid',
        timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        userId: 'system'
      },
      {
        status: 'confirmed',
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        userId: 'secretary'
      },
      {
        status: 'scheduled',
        timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        userId: 'secretary'
      }
    ],
    
    // ScentWorkEntry specific properties
    classConfig,
    displayInfo,
    
    judgingState: {
      isInProgress: false
    },
    
    // Check-in status for exhibitor management
    checkInStatus: generateCheckInStatus(entryIndex)
  };
}

/**
 * Generate mock Scent Work entries for a class
 */
export function generateMockScentWorkEntries(
  classId: string,
  config: {
    element: ScentWorkClassConfig['element'];
    level: ScentWorkClassConfig['level'];
    count?: number;
  }
): ScentWorkEntry[] {
  const { element, level, count = 8 } = config;
  
  const entries: ScentWorkEntry[] = [];
  
  for (let i = 0; i < count; i++) {
    const entry = generateBaseEntry(classId, i, { element, level });
    entries.push(entry);
  }
  
  // Sort by armband number for consistent display
  return entries.sort((a, b) =>
    parseInt(a.displayInfo.armband, 10) - parseInt(b.displayInfo.armband, 10)
  );
}

/**
 * Generate mock class information
 */
export function generateMockClassInfo(classId: string) {
  const classSeed = `class-${classId}`;
  
  // Determine element and level from classId pattern or use random
  const elements: ScentWorkClassConfig['element'][] = ['Container', 'Interior', 'Exterior', 'Buried'];
  const levels: ScentWorkClassConfig['level'][] = ['Novice', 'Advanced', 'Excellent', 'Masters'];
  
  const element = seededChoice(elements, `${classSeed}-element`);
  const level = seededChoice(levels, `${classSeed}-level`);
  
  const judges = [
    'Ellen Heavner', 'Amy Heggenstaller', 'Christine Kabel', 'Marie Burnett',
    'Linda Brennan', 'Suzy Brennan', 'Kathy Kuhns', 'Patty Livingston'
  ];
  
  return {
    id: classId,
    element,
    level,
    judge: seededChoice(judges, `${classSeed}-judge`),
    trialId: `trial-${classId.split('-')[0]}`,
    status: 'Scheduled' as const,
    timeLimit: getTimeLimit(element, level)
  };
}

/**
 * Generate realistic mock results for completed entries
 */
export function generateMockResults(entries: ScentWorkEntry[], completionRate: number = 0.3) {
  const results = new Map();
  const completedCount = Math.floor(entries.length * completionRate);
  
  for (let i = 0; i < completedCount; i++) {
    const entry = entries[i];
    const resultSeed = `result-${entry.id}`;
    const random = seededRandom(resultSeed);
    
    // 80% qualification rate for realistic results
    const isQualified = random > 0.2;
    const searchTime = Math.floor(
      random * entry.classConfig.timeLimit * (isQualified ? 0.8 : 1.2)
    );
    
    const result = {
      entryId: entry.id,
      classId: entry.classId,
      searchTime,
      maxTimeAllowed: entry.classConfig.timeLimit,
      qualification: isQualified ? 'Qualified' : 'Not Qualified',
      faults: isQualified ? Math.floor(seededRandom(`${resultSeed}-faults`) * 3) : 0,
      nqReason: isQualified ? undefined : 'noFind',
      recordedBy: 'mock-judge',
      recordedAt: new Date(),
      isProvisional: false
    };
    
    results.set(entry.id, result);
  }
  
  return results;
}

/**
 * Helper to create a complete mock judging scenario
 */
export function createMockJudgingScenario(classId: string = 'class-001') {
  const classInfo = generateMockClassInfo(classId);
  const entries = generateMockScentWorkEntries(classId, {
    element: classInfo.element,
    level: classInfo.level,
    count: 12
  });
  const results = generateMockResults(entries, 0.4); // 40% completed
  
  return {
    classInfo,
    entries,
    results
  };
}