/**
 * Cascading delete utilities for maintaining data integrity
 * Handles proper cleanup of related records when deleting parent entities
 */

import { useTrialStore } from '@/store/trialStore';
import { useClassStore } from '@/store/classStore';
import { useEntryStore } from '@/store/entryStore';
import { useDogStore } from '@/store/dogStore';

export interface CascadingDeleteResult {
  showId: string;
  deletedTrials: string[];
  deletedClasses: string[];
  deletedEntries: string[];
  totalDeleted: number;
}

export interface CascadingDeletePreview {
  showId: string;
  showName: string;
  trialsToDelete: Array<{ id: string; name: string; date: string }>;
  classesToDelete: Array<{ id: string; name: string; trialName: string }>;
  entriesToDelete: Array<{ id: string; dogName: string; className: string }>;
  totalToDelete: number;
}

/**
 * Preview what will be deleted when cascading delete is performed
 */
export function previewCascadingDelete(showId: string, showName: string): CascadingDeletePreview {
  const trialStore = useTrialStore.getState();
  const classStore = useClassStore.getState();
  const entryStore = useEntryStore.getState();
  const dogStore = useDogStore.getState();

  // Find all trials for this show
  const trialsToDelete = trialStore.trials.filter(trial => trial.showId === showId);
  const trialIds = trialsToDelete.map(t => t.id);

  // Find all classes for those trials
  const classesToDelete = classStore.classes.filter(cls => 
    trialIds.includes(cls.trialId)
  );
  const classIds = classesToDelete.map(c => c.id);

  // Find all entries for those classes
  const entriesToDelete = entryStore.entries.filter(entry => 
    classIds.includes(entry.classId)
  );

  return {
    showId,
    showName,
    trialsToDelete: trialsToDelete.map(t => ({
      id: t.id,
      name: t.name || 'Unnamed Trial',
      date: t.trialDate
    })),
    classesToDelete: classesToDelete.map(c => ({
      id: c.id,
      name: c.className || c.trial || 'Unnamed Class',
      trialName: trialsToDelete.find(t => t.id === c.trialId)?.name || 'Unknown Trial'
    })),
    entriesToDelete: entriesToDelete.map(e => {
      const dog = dogStore.dogs.find(d => d.id === e.dogId);
      return {
        id: e.id,
        dogName: dog?.name || 'Unknown Dog',
        className: classesToDelete.find(c => c.id === e.classId)?.className || 'Unknown Class'
      };
    }),
    totalToDelete: trialsToDelete.length + classesToDelete.length + entriesToDelete.length
  };
}

/**
 * Perform cascading delete of show and all related data
 */
export function performCascadingDelete(showId: string): CascadingDeleteResult {
  const trialStore = useTrialStore.getState();
  const classStore = useClassStore.getState();
  const entryStore = useEntryStore.getState();

  // Find all related data
  const trialsToDelete = trialStore.trials.filter(trial => trial.showId === showId);
  const trialIds = trialsToDelete.map(t => t.id);

  const classesToDelete = classStore.classes.filter(cls => 
    trialIds.includes(cls.trialId)
  );
  const classIds = classesToDelete.map(c => c.id);

  const entriesToDelete = entryStore.entries.filter(entry => 
    classIds.includes(entry.classId)
  );

  console.log('🗑️ Cascading delete for show:', showId);
  console.log('📊 Will delete:', {
    trials: trialsToDelete.length,
    classes: classesToDelete.length,
    entries: entriesToDelete.length
  });

  // Delete in reverse order: entries → classes → trials
  // (The show itself is deleted by the caller)

  // 1. Delete entries
  entriesToDelete.forEach(entry => {
    entryStore.deleteEntry(entry.id);
  });

  // 2. Delete classes
  classesToDelete.forEach(cls => {
    classStore.deleteClass(cls.id);
  });

  // 3. Delete trials
  trialsToDelete.forEach(trial => {
    trialStore.removeTrial(trial.id);
  });

  const result: CascadingDeleteResult = {
    showId,
    deletedTrials: trialIds,
    deletedClasses: classIds,
    deletedEntries: entriesToDelete.map(e => e.id),
    totalDeleted: trialsToDelete.length + classesToDelete.length + entriesToDelete.length
  };

  console.log('✅ Cascading delete completed:', result);
  return result;
}

/**
 * Check if a show has any related data that would be deleted
 */
export function hasRelatedData(showId: string): boolean {
  const trialStore = useTrialStore.getState();
  const trials = trialStore.trials.filter(trial => trial.showId === showId);
  return trials.length > 0;
}