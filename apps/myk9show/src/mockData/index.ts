// Re-export all mock data

// Users and Dogs
export { mockUsers } from './mockUsers';
export { mockDogs } from './mockDogs';

// Health Records
export {
  MOCK_VACCINATIONS,
  MOCK_VET_VISITS,
  MOCK_MEDICATIONS,
  MOCK_ALLERGIES,
} from './mockHealthRecords';

// Training Entries
export { MOCK_TRAINING_ENTRIES } from './mockTrainingEntries';

// Re-export types for convenience
export type { TrainingEntry } from '@/components/dogs/DogDetails/TrainingJournal/AddTrainingEntryDialog';
