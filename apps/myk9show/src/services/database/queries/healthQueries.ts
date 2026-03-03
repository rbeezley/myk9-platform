// Health records database queries - barrel file
// Re-exports from domain-specific modules for backward compatibility

// Health Records (Parent table)
export {
  getAllHealthRecords,
  getHealthRecordById,
  createHealthRecord,
  updateHealthRecord,
  deleteHealthRecord,
} from './healthRecordQueries';

export type {
  DbHealthRecordInsert,
  DbHealthRecordUpdate,
} from './healthRecordQueries';

// Vaccinations
export {
  getAllVaccinations,
  getVaccinationById,
  createVaccination,
  updateVaccination,
  deleteVaccination,
  getUpcomingVaccinations,
} from './vaccinationQueries';

export type {
  DbVaccinationInsert,
  DbVaccinationUpdate,
} from './vaccinationQueries';

// Medications
export {
  getAllMedications,
  getActiveMedications,
  createMedication,
  updateMedication,
  deleteMedication,
} from './medicationQueries';

export type {
  DbMedicationInsert,
  DbMedicationUpdate,
} from './medicationQueries';

// Allergies
export {
  getAllAllergies,
  getActiveAllergies,
  createAllergy,
  updateAllergy,
  deleteAllergy,
} from './allergyQueries';

export type {
  DbAllergyInsert,
  DbAllergyUpdate,
} from './allergyQueries';

// Vet Visits
export {
  getAllVetVisits,
  getVetVisitsRequiringFollowUp,
  createVetVisit,
  updateVetVisit,
  deleteVetVisit,
} from './vetVisitQueries';

export type {
  DbVetVisitInsert,
  DbVetVisitUpdate,
} from './vetVisitQueries';

// Health Statistics, Timeline & Search
export {
  getHealthStatistics,
  getHealthTimeline,
  searchHealthRecords,
} from './healthStatisticsQueries';

// OFA Screenings
export {
  getAllOFAScreenings,
  getOFAScreeningById,
  createOFAScreening,
  updateOFAScreening,
  deleteOFAScreening,
} from './ofaScreeningQueries';

export type { DbOFAScreeningInsert, DbOFAScreeningUpdate } from './ofaScreeningQueries';

// Genetic Screenings
export {
  getAllGeneticScreenings,
  getGeneticScreeningById,
  createGeneticScreening,
  updateGeneticScreening,
  deleteGeneticScreening,
} from './geneticScreeningQueries';

export type {
  DbGeneticScreeningInsert,
  DbGeneticScreeningUpdate,
} from './geneticScreeningQueries';
