import { ShowEntry, RegistrationData } from '../store/entryStore';
import { ShowRegistration, ShowEntry as OldShowEntry, ClassEntry } from '../types/show-registration-types';

/**
 * Utility to migrate data from old store architecture to new unified entry store
 */

export function migrateRegistrationToEntries(
  registration: ShowRegistration,
  showId: string
): Omit<ShowEntry, 'id' | 'status' | 'statusHistory' | 'createdAt' | 'updatedAt'>[] {
  const entries: Omit<ShowEntry, 'id' | 'status' | 'statusHistory' | 'createdAt' | 'updatedAt'>[] = [];
  
  registration.entries.forEach((showEntry: OldShowEntry) => {
    showEntry.classes.forEach((classEntry: ClassEntry) => {
      // Map old registration data to new format
      const registrationData: RegistrationData = {
        submittedAt: (registration.createdAt instanceof Date ? registration.createdAt.toISOString() : registration.createdAt) || new Date().toISOString(),
        handler: showEntry.handler?.name || showEntry.handlerName || 'Unknown Handler',
        handlerId: showEntry.handler?.id || showEntry.handlerId,
        entryFee: classEntry.fee || 25, // Default fee if not specified
        paymentStatus: mapPaymentStatus(registration.paymentStatus),
        specialRequests: showEntry.specialRequests,
        armband: showEntry.armband,
        runOrder: classEntry.runOrder,
        jumpHeight: classEntry.jumpHeight,
        preferredJudge: classEntry.preferredJudge,
        moveUpRequested: classEntry.moveUpRequested
      };
      
      const newEntry = {
        showId,
        classId: classEntry.classId,
        dogId: showEntry.dogId,
        registrationData
      };
      
      entries.push(newEntry);
    });
  });
  
  return entries;
}

function mapPaymentStatus(oldStatus?: string): 'pending' | 'paid' | 'refunded' {
  if (!oldStatus) return 'pending';
  
  switch (oldStatus.toLowerCase()) {
    case 'paid':
    case 'completed':
    case 'confirmed':
      return 'paid';
    case 'refunded':
    case 'cancelled':
      return 'refunded';
    default:
      return 'pending';
  }
}

/**
 * Migrate old class store entries to new format
 */
interface OldClassEntry {
  score?: string;
  time?: string;
  placement?: string;
  status?: string;
  notes?: string;
}

interface CompetitionData {
  score: string;
  time: string;
  placement: string;
  qualified: boolean;
  judgeNotes: string;
  recordedBy: string;
  recordedAt: string;
}

export function migrateClassEntryToCompetition(
  oldEntry: OldClassEntry,
  entryId: string
): { entryId: string; competitionData: CompetitionData } | null {
  // Only migrate if this appears to be a competition result (has score/time/placement)
  if (!oldEntry.score && !oldEntry.time && !oldEntry.placement) {
    return null;
  }
  
  return {
    entryId,
    competitionData: {
      score: oldEntry.score || '',
      time: oldEntry.time || '',
      placement: oldEntry.placement || '',
      qualified: oldEntry.status === 'Qualified',
      judgeNotes: oldEntry.notes || '',
      recordedBy: 'migrated-data',
      recordedAt: new Date().toISOString()
    }
  };
}

/**
 * Create sample entries for development
 */
export function createSampleEntries(): Omit<ShowEntry, 'id' | 'status' | 'statusHistory' | 'createdAt' | 'updatedAt'>[] {
  // Get the current class ID from the URL if available
  const currentUrl = typeof window !== 'undefined' ? window.location.pathname : '';
  const urlClassId = currentUrl.match(/\/classes\/(.+)$/)?.[1];
  
  // Use the current class ID if available, otherwise use a default pattern
  const targetClassId = urlClassId || '1-class-1749403840319-0';
  
  return [
    {
      showId: '1', // Summer Specialty Show
      classId: targetClassId, // Use current or default class ID
      dogId: '1', // Max
      registrationData: {
        submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(), // 1 week ago
        handler: 'John Smith',
        handlerId: '1',
        entryFee: 25,
        paymentStatus: 'paid',
        armband: 'A101'
      }
    },
    {
      showId: '1',
      classId: targetClassId, // Use same class for consistency
      dogId: '3', // Bella
      registrationData: {
        submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(), // 3 days ago
        handler: 'Sarah Wilson',
        handlerId: '3',
        entryFee: 25,
        paymentStatus: 'pending',
        specialRequests: 'First time showing'
      }
    }
  ];
}

/**
 * Seed the new store with sample data
 */
export function seedEntryStore() {
  const sampleEntries = createSampleEntries();
  return sampleEntries;
}