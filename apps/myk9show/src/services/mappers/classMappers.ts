/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// TODO: Fix type errors - missing columns updated_by, created_by, status in database schema
// Class Data Mappers - Phase 2.5: Class Store Integration
// Handles type conversion between classStore types and database types

import type { DbClass, DbClassInsert, DbClassUpdate, DbEntry, DbEntryInsert, DbEntryUpdate } from '@/types/database-mappings';
import type { ClassInput, EntryInput, SyncableClassData, SyncableEntryData } from '@/store/classStore';
// import { generateId } from '@/utils/idUtils';
import { getLastModifiedBy } from '@/utils/authHelpers';

// ===== CLASS MAPPERS =====

/**
 * Convert ClassInput to database insert format
 */
export const mapClassInputToInsert = (classData: ClassInput): DbClassInsert => {
  return {
    // Core class information
    name: classData.className || 'Unnamed Class',
    level: classData.level || null,
    description: classData.element ? `${classData.element} ${classData.level}` : null,
    
    // Trial relationship
    trial_id: classData.trialId || null,
    
    // Entry configuration
    entry_fee: classData.entryFee || null,
    max_entries: classData.maxEntries || null,
    
    // Timing and scheduling
    start_time: classData.classOrder ? `${classData.classOrder}:00:00` : null,
    estimated_duration: null, // Calculate based on entries
    
    // Height restrictions
    jump_heights: classData.requiresJumpHeight ? ['12"', '16"', '20"', '24"'] : null,
    height_min: null,
    height_max: null,
    
    // Age restrictions
    age_min: null,
    age_max: null,
    handler_age_min: null,
    handler_age_max: null,
    
    // Rules and restrictions
    allows_waitlist: true,
    breed_restrictions: null,
    max_dogs_per_handler: null,
    
    // Metadata
    created_by: getLastModifiedBy(),
  };
};

/**
 * Convert partial ClassInput to database update format
 */
export const mapClassInputToUpdate = (updates: Partial<ClassInput>): DbClassUpdate => {
  const updateData: DbClassUpdate = {
    updated_by: getLastModifiedBy(),
  };

  // Map fields that have corresponding database columns
  if (updates.className !== undefined) {
    updateData.name = updates.className;
  }
  if (updates.level !== undefined) {
    updateData.level = updates.level;
  }
  if (updates.entryFee !== undefined) {
    updateData.entry_fee = updates.entryFee;
  }
  if (updates.maxEntries !== undefined) {
    updateData.max_entries = updates.maxEntries;
  }
  if (updates.trialId !== undefined) {
    updateData.trial_id = updates.trialId;
  }
  if (updates.classOrder !== undefined) {
    updateData.start_time = updates.classOrder ? `${updates.classOrder}:00:00` : null;
  }
  if (updates.requiresJumpHeight !== undefined) {
    updateData.jump_heights = updates.requiresJumpHeight ? ['12"', '16"', '20"', '24"'] : null;
  }
  if (updates.element !== undefined || updates.level !== undefined) {
    const element = updates.element || '';
    const level = updates.level || '';
    updateData.description = element && level ? `${element} ${level}` : null;
  }

  return updateData;
};

/**
 * Convert database class to SyncableClassData format
 */
export const mapDatabaseToClass = (dbClass: DbClass & { trial?: unknown; entry?: unknown[] }): SyncableClassData => {
  // Extract trial information if available
  const trial = dbClass.trial as { name?: string; date?: string; trial_number?: string } | undefined;
  
  // Calculate entry count
  // const entryCount = Array.isArray(dbClass.entry) ? dbClass.entry.length : 0;
  
  return {
    id: dbClass.id,
    trialId: dbClass.trial_id || '',
    trial: trial?.name || 'Unknown Trial',
    trialDate: trial?.date || new Date().toISOString().split('T')[0],
    trialNumber: trial?.trial_number || 'TBD',
    classOrder: dbClass.start_time ? extractClassOrder(dbClass.start_time) : '1',
    status: 'Scheduled', // Map from entry status or other logic
    judge: 'TBD', // Will need to be populated from judge assignments
    
    // Class details
    className: dbClass.name,
    classNumber: dbClass.id.substring(0, 8), // Use first 8 chars of ID as class number
    element: extractElement(dbClass.description),
    level: dbClass.level || '',
    section: 'A', // Default section
    
    // Entry configuration
    entryFee: dbClass.entry_fee || 0,
    maxEntries: dbClass.max_entries || 40,
    requiresJumpHeight: Array.isArray(dbClass.jump_heights) && dbClass.jump_heights.length > 0,
    
    // Scent work specific fields (legacy compatibility)
    hidesUsed: '',
    distractionsUsed: '',
    itemsUsed: '',
    timeLimit1: '3:00',
    timeLimit2: '',
    timeLimit3: '',
    photoUrl: '',
    
    // Custom fields
    customFields: {},
    templateId: undefined,
    
    // Sync metadata
    _version: 1,
    _lastModified: new Date(dbClass.updated_at || dbClass.created_at || new Date()),
    _lastModifiedBy: dbClass.updated_by || dbClass.created_by || 'system',
    _syncStatus: 'synced',
    _localOnly: false,
  };
};

/**
 * Convert array of database classes to SyncableClassData array
 */
export const mapDatabaseClassesArray = (dbClasses: (DbClass & { trial?: unknown; entry?: unknown[] })[]): SyncableClassData[] => {
  return dbClasses.map(mapDatabaseToClass);
};

// ===== ENTRY MAPPERS =====

/**
 * Convert EntryInput to database insert format
 */
export const mapEntryInputToInsert = (entryData: EntryInput): DbEntryInsert => {
  return {
    class_id: entryData.classId,
    dog_id: null, // Will need to be resolved from dog name
    armband: entryData.armband,
    status: mapEntryStatus(entryData.status),
    
    // Handler information (will need to be resolved)
    handler: entryData.handler,
    
    // Entry metadata
    created_by: getLastModifiedBy(),
    
    // Note: score, time, placement are stored in the result table, not entry table
  };
};

/**
 * Convert partial EntryInput to database update format
 */
export const mapEntryInputToUpdate = (updates: Partial<EntryInput>): DbEntryUpdate => {
  const updateData: DbEntryUpdate = {
    updated_by: getLastModifiedBy(),
  };

  if (updates.armband !== undefined) {
    updateData.armband = updates.armband;
  }
  if (updates.handler !== undefined) {
    updateData.handler = updates.handler;
  }
  if (updates.status !== undefined) {
    updateData.status = mapEntryStatus(updates.status);
  }
  
  // Note: score, time, placement are updated in the result table, not entry table

  return updateData;
};

/**
 * Convert database entry to SyncableEntryData format
 */
export const mapDatabaseToEntry = (dbEntry: DbEntry & { dog?: unknown; class?: unknown; result?: unknown }): SyncableEntryData => {
  // Extract dog information if available
  const dog = dbEntry.dog as { name?: string } | undefined;
  
  // Extract result information if available
  const result = dbEntry.result as { score?: string; time_seconds?: number; placement?: string } | undefined;
  
  return {
    id: dbEntry.id,
    armband: dbEntry.armband || '',
    handler: dbEntry.handler || 'Unknown',
    dog: dog?.name || 'Unknown Dog',
    status: mapDatabaseEntryStatus(dbEntry.status),
    score: result?.score || '',
    time: result?.time_seconds?.toString() || '',
    placement: result?.placement || '',
    classId: dbEntry.class_id || '',
    
    // Sync metadata
    _version: 1,
    _lastModified: new Date(dbEntry.updated_at || dbEntry.created_at || new Date()),
    _lastModifiedBy: dbEntry.updated_by || dbEntry.created_by || 'system',
    _syncStatus: 'synced',
    _localOnly: false,
  };
};

/**
 * Convert array of database entries to SyncableEntryData array
 */
export const mapDatabaseEntriesArray = (dbEntries: (DbEntry & { dog?: unknown; class?: unknown; result?: unknown })[]): SyncableEntryData[] => {
  return dbEntries.map(mapDatabaseToEntry);
};

// ===== HELPER FUNCTIONS =====

/**
 * Extract class order from start_time
 */
const extractClassOrder = (startTime: string): string => {
  if (!startTime) return '1';
  const hour = startTime.split(':')[0];
  return hour || '1';
};

/**
 * Extract element from description
 */
const extractElement = (description: string | null): string => {
  if (!description) return '';
  const parts = description.split(' ');
  return parts[0] || '';
};

/**
 * Map entry status from classStore format to database format
 */
const mapEntryStatus = (status: string): string => {
  const statusMap: Record<string, string> = {
    'Qualified': 'qualified',
    'Not Qualified': 'not_qualified',
    'Absent': 'absent',
    'Excused': 'excused',
    'Withdrawn': 'withdrawn',
  };
  return statusMap[status] || 'pending';
};

/**
 * Map entry status from database format to classStore format
 */
const mapDatabaseEntryStatus = (status: string | null): 'Qualified' | 'Not Qualified' | 'Absent' | 'Excused' | 'Withdrawn' | 'Eliminated' => {
  if (!status) return 'Not Qualified';
  
  const statusMap: Record<string, 'Qualified' | 'Not Qualified' | 'Absent' | 'Excused' | 'Withdrawn' | 'Eliminated'> = {
    'qualified': 'Qualified',
    'not_qualified': 'Not Qualified',
    'absent': 'Absent',
    'excused': 'Excused',
    'withdrawn': 'Withdrawn',
    'pending': 'Not Qualified',
  };
  return statusMap[status] || 'Not Qualified';
};

/**
 * Create default sync metadata for new records
 */
export const createSyncMetadata = () => ({
  _version: 1,
  _lastModified: new Date(),
  _lastModifiedBy: getLastModifiedBy(),
  _syncStatus: 'pending' as const,
  _localOnly: false,
});