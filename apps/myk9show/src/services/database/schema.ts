// IndexedDB schema definitions for myK9Show
export const DATABASE_NAME = 'myK9ShowDB';
export const DATABASE_VERSION = 4; // Updated with _zustand_state index optimization

// Object store schema definitions
export const STORES = {
  // Core Entities
  dogs: {
    keyPath: 'id',
    autoIncrement: false,
    indexes: [
      { name: 'ownerId', keyPath: 'ownerId', unique: false },
      { name: 'registrationNumber', keyPath: 'registrationNumber', unique: false },
      { name: 'breed', keyPath: 'breed', unique: false },
      { name: 'breed_height', keyPath: ['breed', 'height'], unique: false },
      // Search and filtering optimizations
      { name: 'ownerId_breed', keyPath: ['ownerId', 'breed'], unique: false },
      { name: 'breed_sex', keyPath: ['breed', 'sex'], unique: false },
      { name: 'name_breed', keyPath: ['name', 'breed'], unique: false },
      { name: 'status_breed', keyPath: ['status', 'breed'], unique: false }
    ]
  },
  
  people: {
    keyPath: 'id',
    autoIncrement: false,
    indexes: [
      { name: 'email', keyPath: 'email', unique: false },
      { name: 'phone', keyPath: 'phone', unique: false },
      { name: 'lastName', keyPath: 'lastName', unique: false },
      { name: 'lastName_firstName', keyPath: ['lastName', 'firstName'], unique: false },
      // Enhanced search indexes
      { name: 'firstName_lastName', keyPath: ['firstName', 'lastName'], unique: false },
      { name: 'email_phone', keyPath: ['email', 'phone'], unique: false },
      { name: 'role_status', keyPath: ['role', 'status'], unique: false },
      { name: 'city_state', keyPath: ['city', 'state'], unique: false }
    ]
  },
  
  shows: {
    keyPath: 'id',
    autoIncrement: false,
    indexes: [
      { name: 'clubId', keyPath: 'clubId', unique: false },
      { name: 'eventDate', keyPath: 'eventDate', unique: false },
      { name: 'status', keyPath: 'status', unique: false },
      { name: 'status_eventDate', keyPath: ['status', 'eventDate'], unique: false },
      // Enhanced indexes for common query patterns
      { name: 'clubId_status', keyPath: ['clubId', 'status'], unique: false },
      { name: 'status_startDate', keyPath: ['status', 'startDate'], unique: false },
      { name: 'location_eventDate', keyPath: ['location', 'eventDate'], unique: false },
      { name: 'eventType_status', keyPath: ['eventType', 'status'], unique: false }
    ]
  },
  
  clubs: {
    keyPath: 'id',
    autoIncrement: false,
    indexes: [
      { name: 'name', keyPath: 'name', unique: false },
      { name: 'state', keyPath: 'state', unique: false },
      { name: 'state_city', keyPath: ['state', 'city'], unique: false }
    ]
  },
  
  // Relationships & Transactions
  entries: {
    keyPath: 'id',
    autoIncrement: false,
    indexes: [
      { name: 'dogId', keyPath: 'dogId', unique: false },
      { name: 'showId', keyPath: 'showId', unique: false },
      { name: 'classId', keyPath: 'classId', unique: false },
      { name: 'status', keyPath: 'status', unique: false },
      { name: 'showId_dogId', keyPath: ['showId', 'dogId'], unique: false },
      // Performance optimized compound indexes
      { name: 'showId_status', keyPath: ['showId', 'status'], unique: false },
      { name: 'dogId_status', keyPath: ['dogId', 'status'], unique: false },
      { name: 'classId_placement', keyPath: ['classId', 'placement'], unique: false },
      { name: 'status_updatedAt', keyPath: ['status', 'updatedAt'], unique: false }
    ]
  },
  
  registrations: {
    keyPath: 'id',
    autoIncrement: false,
    indexes: [
      { name: 'dogId', keyPath: 'dogId', unique: false },
      { name: 'showId', keyPath: 'showId', unique: false },
      { name: 'status', keyPath: 'status', unique: false }
    ]
  },
  
  trials: {
    keyPath: 'id',
    autoIncrement: false,
    indexes: [
      { name: 'showId', keyPath: 'showId', unique: false },
      { name: 'trialType', keyPath: 'trialType', unique: false }
    ]
  },
  
  classes: {
    keyPath: 'id',
    autoIncrement: false,
    indexes: [
      { name: 'trialId', keyPath: 'trialId', unique: false },
      { name: 'className', keyPath: 'className', unique: false },
      { name: 'height', keyPath: 'height', unique: false },
      // Performance indexes for class management
      { name: 'trialId_className', keyPath: ['trialId', 'className'], unique: false },
      { name: 'height_division', keyPath: ['height', 'division'], unique: false },
      { name: 'status_startTime', keyPath: ['status', 'startTime'], unique: false }
    ]
  },
  
  // Competition Results
  competitions: {
    keyPath: 'id',
    autoIncrement: false,
    indexes: [
      { name: 'dogId', keyPath: 'dogId', unique: false },
      { name: 'showId', keyPath: 'showId', unique: false },
      { name: 'competitionDate', keyPath: 'competitionDate', unique: false }
    ]
  },
  
  achievements: {
    keyPath: 'id',
    autoIncrement: false,
    indexes: [
      { name: 'dogId', keyPath: 'dogId', unique: false },
      { name: 'achievementType', keyPath: 'achievementType', unique: false },
      { name: 'date', keyPath: 'date', unique: false }
    ]
  },
  
  results: {
    keyPath: 'id',
    autoIncrement: false,
    indexes: [
      { name: 'competitionId', keyPath: 'competitionId', unique: false },
      { name: 'dogId', keyPath: 'dogId', unique: false },
      { name: 'placement', keyPath: 'placement', unique: false }
    ]
  },
  
  // Configuration
  templates: {
    keyPath: 'id',
    autoIncrement: false,
    indexes: [
      { name: 'organization', keyPath: 'organization', unique: false },
      { name: 'templateType', keyPath: 'templateType', unique: false }
    ]
  },
  
  classTemplates: {
    keyPath: 'id',
    autoIncrement: false,
    indexes: [
      { name: 'templateId', keyPath: 'templateId', unique: false },
      { name: 'className', keyPath: 'className', unique: false }
    ]
  },
  
  showTemplates: {
    keyPath: 'id',
    autoIncrement: false,
    indexes: [
      { name: 'organization', keyPath: 'organization', unique: false },
      { name: 'showType', keyPath: 'showType', unique: false }
    ]
  },
  
  // Operational
  armbands: {
    keyPath: 'id',
    autoIncrement: false,
    indexes: [
      { name: 'showId', keyPath: 'showId', unique: false },
      { name: 'trialId', keyPath: 'trialId', unique: false },
      { name: 'dogId', keyPath: 'dogId', unique: false }
    ]
  },
  
  drafts: {
    keyPath: 'id',
    autoIncrement: false,
    indexes: [
      { name: 'showId', keyPath: 'showId', unique: false },
      { name: 'userId', keyPath: 'userId', unique: false },
      { name: 'lastModified', keyPath: 'lastModified', unique: false }
    ]
  },
  
  // Zustand state storage
  _zustand_state: {
    keyPath: 'id',
    autoIncrement: false,
    indexes: [
      { name: 'lastModified', keyPath: 'lastModified', unique: false },
      // Add composite index for better query performance
      { name: 'id_lastModified', keyPath: ['id', 'lastModified'], unique: false }
    ]
  },

  // Sync metadata stores (Phase 6)
  syncMetadata: {
    keyPath: 'id',
    autoIncrement: false,
    indexes: [
      { name: 'entityType', keyPath: 'entityType', unique: false },
      { name: 'entityId', keyPath: 'entityId', unique: false },
      { name: 'lastSyncedAt', keyPath: 'lastSyncedAt', unique: false },
      { name: 'syncStatus', keyPath: 'syncStatus', unique: false },
      { name: 'entityType_entityId', keyPath: ['entityType', 'entityId'], unique: true }
    ]
  },

  syncQueue: {
    keyPath: 'id',
    autoIncrement: false,
    indexes: [
      { name: 'status', keyPath: 'status', unique: false },
      { name: 'createdAt', keyPath: 'timestamp', unique: false },
      { name: 'retryCount', keyPath: 'retryCount', unique: false },
      { name: 'priority', keyPath: 'priority', unique: false },
      { name: 'status_priority', keyPath: ['status', 'priority'], unique: false }
    ]
  },

  conflicts: {
    keyPath: 'id',
    autoIncrement: false,
    indexes: [
      { name: 'entityType', keyPath: 'entityType', unique: false },
      { name: 'entityId', keyPath: 'entityId', unique: false },
      { name: 'status', keyPath: 'status', unique: false },
      { name: 'detectedAt', keyPath: 'detectedAt', unique: false },
      { name: 'entityId_status', keyPath: ['entityId', 'status'], unique: false }
    ]
  },

  syncSessions: {
    keyPath: 'id',
    autoIncrement: false,
    indexes: [
      { name: 'startTime', keyPath: 'startTime', unique: false },
      { name: 'status', keyPath: 'status', unique: false },
      { name: 'endTime', keyPath: 'endTime', unique: false }
    ]
  }
} as const;

// Enhanced schema generation with index analysis
export function generateDexieSchema(): Record<string, string> {
  const schema: Record<string, string> = {};
  
  Object.entries(STORES).forEach(([storeName, storeConfig]) => {
    const keyPath = storeConfig.keyPath;
    const indexStrings = storeConfig.indexes.map(index => {
      if (Array.isArray(index.keyPath)) {
        return `[${index.keyPath.join('+')}]`;
      }
      return index.keyPath;
    });
    
    schema[storeName] = [keyPath, ...indexStrings].join(', ');
  });
  
  return schema;
}

// Schema analysis utilities
export function analyzeSchemaComplexity(): SchemaAnalysis {
  const analysis: SchemaAnalysis = {
    totalStores: Object.keys(STORES).length,
    totalIndexes: 0,
    compoundIndexes: 0,
    storeMetrics: {},
    recommendations: []
  };
  
  Object.entries(STORES).forEach(([storeName, storeConfig]) => {
    const indexes = storeConfig.indexes;
    const compoundCount = indexes.filter(idx => Array.isArray(idx.keyPath)).length;
    
    analysis.totalIndexes += indexes.length;
    analysis.compoundIndexes += compoundCount;
    
    analysis.storeMetrics[storeName] = {
      indexCount: indexes.length,
      compoundIndexCount: compoundCount,
      complexity: indexes.length > 8 ? 'high' : indexes.length > 4 ? 'medium' : 'low'
    };
    
    // Generate recommendations
    if (indexes.length < 3) {
      analysis.recommendations.push(`Consider adding more indexes to ${storeName} for better query performance`);
    }
    if (compoundCount === 0 && indexes.length > 2) {
      analysis.recommendations.push(`Consider compound indexes for ${storeName} common query patterns`);
    }
  });
  
  return analysis;
}

// Type definitions for schema analysis
export interface SchemaAnalysis {
  totalStores: number;
  totalIndexes: number;
  compoundIndexes: number;
  storeMetrics: Record<string, StoreMetrics>;
  recommendations: string[];
}

export interface StoreMetrics {
  indexCount: number;
  compoundIndexCount: number;
  complexity: 'low' | 'medium' | 'high';
}

// Store name constants for type safety
export const STORE_NAMES = Object.keys(STORES) as Array<keyof typeof STORES>;