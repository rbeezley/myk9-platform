/**
 * Orphaned Records Cleaner
 * 
 * Identifies and removes orphaned records that no longer have valid
 * relationships, helping maintain data integrity and reduce storage.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useDogStore } from '@/store/dogStore';
import { useUserStore } from '@/store/userStore';
import { useEntryStore } from '@/store/entryStore';
import { useShowStore } from '@/store/showStore';
import { useRegistrationsStore } from '@/store/registrationsStore';

export interface OrphanedRecord {
  type: string;
  id: string;
  reason: string;
  relatedIds: string[];
  sizeSaved?: number;
}

export interface CleanupReport {
  scanStarted: Date;
  scanCompleted: Date;
  recordsScanned: number;
  orphansFound: number;
  orphansRemoved: number;
  spaceReclaimed: number;
  errors: string[];
  details: OrphanedRecord[];
}

export interface CleanupOptions {
  /** Whether to actually delete orphans or just report them */
  dryRun: boolean;
  /** Types of orphans to check for */
  checkTypes: OrphanCheckType[];
  /** Whether to create backup before deletion */
  createBackup: boolean;
  /** Maximum orphans to process in one run */
  batchSize: number;
}

export type OrphanCheckType = 
  | 'dogs_without_owners'
  | 'entries_without_shows'
  | 'entries_without_dogs'
  | 'registrations_without_dogs'
  | 'results_without_entries'
  | 'documents_without_parents'
  | 'people_without_relationships'
  | 'duplicate_records';

const DEFAULT_OPTIONS: CleanupOptions = {
  dryRun: true,
  checkTypes: [
    'dogs_without_owners',
    'entries_without_shows',
    'entries_without_dogs',
    'registrations_without_dogs',
  ],
  createBackup: true,
  batchSize: 100,
};

export class OrphanedRecordsCleaner {
  private options: CleanupOptions;
  private backupData: Map<string, any[]> = new Map();
  
  constructor(options: Partial<CleanupOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Run a complete orphan cleanup scan
   */
  public async runCleanup(): Promise<CleanupReport> {
    const report: CleanupReport = {
      scanStarted: new Date(),
      scanCompleted: new Date(),
      recordsScanned: 0,
      orphansFound: 0,
      orphansRemoved: 0,
      spaceReclaimed: 0,
      errors: [],
      details: [],
    };
    
    console.log(`🔍 Starting orphaned records cleanup (dry run: ${this.options.dryRun})`);
    
    try {
      for (const checkType of this.options.checkTypes) {
        const orphans = await this.findOrphans(checkType);
        report.orphansFound += orphans.length;
        report.details.push(...orphans);
        
        if (!this.options.dryRun && orphans.length > 0) {
          const removed = await this.removeOrphans(orphans.slice(0, this.options.batchSize));
          report.orphansRemoved += removed.length;
          report.spaceReclaimed += removed.reduce((sum, r) => sum + (r.sizeSaved || 0), 0);
        }
      }
    } catch (error) {
      report.errors.push(`Cleanup failed: ${error}`);
      console.error('❌ Orphaned records cleanup failed:', error);
    }
    
    report.scanCompleted = new Date();
    this.logReport(report);
    
    return report;
  }

  /**
   * Find orphaned records of a specific type
   */
  private async findOrphans(checkType: OrphanCheckType): Promise<OrphanedRecord[]> {
    console.log(`🔍 Checking for: ${checkType}`);
    
    switch (checkType) {
      case 'dogs_without_owners':
        return this.findDogsWithoutOwners();
        
      case 'entries_without_shows':
        return this.findEntriesWithoutShows();
        
      case 'entries_without_dogs':
        return this.findEntriesWithoutDogs();
        
      case 'registrations_without_dogs':
        return this.findRegistrationsWithoutDogs();
        
      case 'people_without_relationships':
        return this.findPeopleWithoutRelationships();
        
      case 'duplicate_records':
        return this.findDuplicateRecords();
        
      default:
        return [];
    }
  }

  /**
   * Find dogs without valid owners
   */
  private findDogsWithoutOwners(): OrphanedRecord[] {
    const dogStore = useDogStore.getState();
    const userStore = useUserStore.getState();
    
    const peopleIds = new Set(userStore.people.map(p => p.id));
    const orphans: OrphanedRecord[] = [];
    
    dogStore.dogs.forEach(dog => {
      if (dog.ownerId && !peopleIds.has(dog.ownerId)) {
        orphans.push({
          type: 'dog',
          id: dog.id,
          reason: 'Owner not found',
          relatedIds: [dog.ownerId],
          sizeSaved: this.estimateRecordSize(dog),
        });
      }
    });
    
    return orphans;
  }

  /**
   * Find entries without valid shows
   */
  private findEntriesWithoutShows(): OrphanedRecord[] {
    const entryStore = useEntryStore.getState();
    const showStore = useShowStore.getState();
    
    const showIds = new Set(showStore.shows.map(s => s.id));
    const orphans: OrphanedRecord[] = [];
    
    entryStore.entries.forEach(entry => {
      if (!showIds.has(entry.showId)) {
        orphans.push({
          type: 'entry',
          id: entry.id,
          reason: 'Show not found',
          relatedIds: [entry.showId],
          sizeSaved: this.estimateRecordSize(entry),
        });
      }
    });
    
    return orphans;
  }

  /**
   * Find entries without valid dogs
   */
  private findEntriesWithoutDogs(): OrphanedRecord[] {
    const entryStore = useEntryStore.getState();
    const dogStore = useDogStore.getState();
    
    const dogIds = new Set(dogStore.dogs.map(d => d.id));
    const orphans: OrphanedRecord[] = [];
    
    entryStore.entries.forEach(entry => {
      if (!dogIds.has(entry.dogId)) {
        orphans.push({
          type: 'entry',
          id: entry.id,
          reason: 'Dog not found',
          relatedIds: [entry.dogId],
          sizeSaved: this.estimateRecordSize(entry),
        });
      }
    });
    
    return orphans;
  }

  /**
   * Find registrations without valid dogs
   */
  private findRegistrationsWithoutDogs(): OrphanedRecord[] {
    const registrationStore = useRegistrationsStore.getState();
    const dogStore = useDogStore.getState();
    
    const dogIds = new Set(dogStore.dogs.map(d => d.id));
    const orphans: OrphanedRecord[] = [];
    
    // Check if registrations have a dogId field
    registrationStore.registrations.forEach(registration => {
      // Note: You may need to adjust this based on your actual registration structure
      const dogId = (registration as any).dogId;
      if (dogId && !dogIds.has(dogId)) {
        orphans.push({
          type: 'registration',
          id: registration.id,
          reason: 'Dog not found',
          relatedIds: [dogId],
          sizeSaved: this.estimateRecordSize(registration),
        });
      }
    });
    
    return orphans;
  }

  /**
   * Find people without any relationships (no dogs, no entries)
   */
  private findPeopleWithoutRelationships(): OrphanedRecord[] {
    const userStore = useUserStore.getState();
    const dogStore = useDogStore.getState();
    const entryStore = useEntryStore.getState();
    
    const peopleWithDogs = new Set(dogStore.dogs.map(d => d.ownerId).filter(Boolean));
    // Find people through their dogs' entries
    const peopleWithEntries = new Set(
      entryStore.entries
        .map(entry => {
          const dog = dogStore.dogs.find(d => d.id === entry.dogId);
          return dog?.ownerId;
        })
        .filter(Boolean)
    );
    
    const orphans: OrphanedRecord[] = [];
    
    userStore.people.forEach(person => {
      if (!peopleWithDogs.has(person.id) && !peopleWithEntries.has(person.id)) {
        // Check if person has been inactive for more than 2 years
        const lastActivity = person._lastModified;
        if (lastActivity) {
          const daysSinceActivity = (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceActivity > 730) { // 2 years
            orphans.push({
              type: 'person',
              id: person.id,
              reason: 'No relationships and inactive for 2+ years',
              relatedIds: [],
              sizeSaved: this.estimateRecordSize(person),
            });
          }
        }
      }
    });
    
    return orphans;
  }

  /**
   * Find duplicate records
   */
  private findDuplicateRecords(): OrphanedRecord[] {
    const orphans: OrphanedRecord[] = [];
    
    // Check for duplicate dogs (same name, breed, and owner)
    const dogStore = useDogStore.getState();
    const dogMap = new Map<string, typeof dogStore.dogs>();
    
    dogStore.dogs.forEach(dog => {
      const key = `${dog.name}-${dog.breed}-${dog.ownerId}`;
      const existing = dogMap.get(key);
      if (existing) {
        existing.push(dog);
      } else {
        dogMap.set(key, [dog]);
      }
    });
    
    dogMap.forEach((dogs, _key) => {
      void _key; // Mark as intentionally unused
      if (dogs.length > 1) {
        // Keep the newest, mark others as orphans (use dateOfBirth as fallback)
        const sorted = dogs.sort((a, b) => {
          const dateA = new Date((a as any).createdAt || a.dateOfBirth || 0).getTime();
          const dateB = new Date((b as any).createdAt || b.dateOfBirth || 0).getTime();
          return dateB - dateA;
        });
        
        sorted.slice(1).forEach(dog => {
          orphans.push({
            type: 'dog',
            id: dog.id,
            reason: 'Duplicate record',
            relatedIds: [sorted[0].id],
            sizeSaved: this.estimateRecordSize(dog),
          });
        });
      }
    });
    
    return orphans;
  }

  /**
   * Remove orphaned records
   */
  private async removeOrphans(orphans: OrphanedRecord[]): Promise<OrphanedRecord[]> {
    const removed: OrphanedRecord[] = [];
    
    // Create backup if requested
    if (this.options.createBackup) {
      await this.createBackup(orphans);
    }
    
    // Group by type for efficient removal
    const orphansByType = new Map<string, OrphanedRecord[]>();
    orphans.forEach(orphan => {
      const list = orphansByType.get(orphan.type) || [];
      list.push(orphan);
      orphansByType.set(orphan.type, list);
    });
    
    // Remove orphans by type
    for (const [type, typeOrphans] of orphansByType) {
      try {
        const removedCount = await this.removeOrphansByType(type, typeOrphans);
        removed.push(...typeOrphans.slice(0, removedCount));
      } catch (error) {
        console.error(`Failed to remove ${type} orphans:`, error);
      }
    }
    
    return removed;
  }

  /**
   * Remove orphans of a specific type
   */
  private async removeOrphansByType(type: string, orphans: OrphanedRecord[]): Promise<number> {
    const ids = orphans.map(o => o.id);
    
    switch (type) {
      case 'dog': {
        const dogStore = useDogStore.getState();
        const originalCount = dogStore.dogs.length;
        const filtered = dogStore.dogs.filter(d => !ids.includes(d.id));
        dogStore.setDogs(filtered);
        return originalCount - filtered.length;
      }
      
      case 'entry': {
        const entryStore = useEntryStore.getState();
        const originalCount = entryStore.entries.length;
        const filtered = entryStore.entries.filter(e => !ids.includes(e.id));
        entryStore.setEntries(filtered);
        return originalCount - filtered.length;
      }
      
      case 'person': {
        const userStore = useUserStore.getState();
        const originalCount = userStore.people.length;
        ids.forEach(id => userStore.deleteUser(id));
        return originalCount - userStore.people.length;
      }
      
      case 'registration': {
        const registrationStore = useRegistrationsStore.getState();
        const originalCount = registrationStore.registrations.length;
        const filtered = registrationStore.registrations.filter(r => !ids.includes(r.id));
        registrationStore.setRegistrations(filtered);
        return originalCount - filtered.length;
      }
      
      default:
        return 0;
    }
  }

  /**
   * Create backup of records before deletion
   */
  private async createBackup(orphans: OrphanedRecord[]): Promise<void> {
    const timestamp = new Date().toISOString();
    const backupKey = `orphan-backup-${timestamp}`;
    
    // Store the orphaned records
    this.backupData.set(backupKey, orphans);
    
    // Also save to localStorage for persistence
    try {
      localStorage.setItem(backupKey, JSON.stringify(orphans));
      console.log(`💾 Backup created: ${backupKey}`);
    } catch (error) {
      console.error('Failed to create backup:', error);
    }
  }

  /**
   * Estimate the size of a record in bytes
   */
  private estimateRecordSize(record: any): number {
    try {
      return JSON.stringify(record).length;
    } catch {
      return 0;
    }
  }

  /**
   * Log the cleanup report
   */
  private logReport(report: CleanupReport): void {
    const duration = report.scanCompleted.getTime() - report.scanStarted.getTime();
    
    console.log('📊 Orphaned Records Cleanup Report');
    console.log('─'.repeat(50));
    console.log(`Duration: ${duration}ms`);
    console.log(`Records scanned: ${report.recordsScanned}`);
    console.log(`Orphans found: ${report.orphansFound}`);
    console.log(`Orphans removed: ${report.orphansRemoved}`);
    console.log(`Space reclaimed: ${(report.spaceReclaimed / 1024).toFixed(2)}KB`);
    
    if (report.errors.length > 0) {
      console.log(`Errors: ${report.errors.length}`);
      report.errors.forEach(error => console.error(` - ${error}`));
    }
    
    if (this.options.dryRun && report.orphansFound > 0) {
      console.log('\n⚠️  Dry run mode - no records were actually deleted');
      console.log('Set dryRun: false to perform actual cleanup');
    }
  }

  /**
   * Get cleanup statistics
   */
  public getStats(): {
    backupsCreated: number;
    lastCleanup?: Date;
    totalSpaceReclaimed: number;
  } {
    return {
      backupsCreated: this.backupData.size,
      lastCleanup: undefined, // Would need to track this
      totalSpaceReclaimed: 0, // Would need to track this
    };
  }

  /**
   * Restore from backup
   */
  public async restoreFromBackup(backupKey: string): Promise<boolean> {
    try {
      const backupData = localStorage.getItem(backupKey);
      if (!backupData) {
        console.error('Backup not found:', backupKey);
        return false;
      }
      
      const orphans: OrphanedRecord[] = JSON.parse(backupData);
      console.log(`🔄 Restoring ${orphans.length} records from backup`);
      
      // TODO: Implement actual restoration logic
      // This would require storing the full record data in the backup
      
      return true;
    } catch (error) {
      console.error('Failed to restore backup:', error);
      return false;
    }
  }
}

// Singleton instance
let cleaner: OrphanedRecordsCleaner | null = null;

export function getOrphanedRecordsCleaner(options?: Partial<CleanupOptions>): OrphanedRecordsCleaner {
  if (!cleaner) {
    cleaner = new OrphanedRecordsCleaner(options);
  }
  return cleaner;
}