// Authoritative data access module for Health Records and their sub-tables
// (allergies, vaccinations, medications, vet visits, OFA & genetic screenings).
// All callers import from here — never from supabaseClient directly.

// Health Records (parent table)
export {
  getAllHealthRecords,
  getHealthRecordById,
  createHealthRecord,
  updateHealthRecord,
  deleteHealthRecord,
} from './records';

export type { DbHealthRecordInsert, DbHealthRecordUpdate } from './records';

// Vaccinations
export {
  getAllVaccinations,
  getVaccinationById,
  createVaccination,
  updateVaccination,
  deleteVaccination,
  getUpcomingVaccinations,
} from './vaccinations';

export type { DbVaccinationInsert, DbVaccinationUpdate } from './vaccinations';

// Medications
export {
  getAllMedications,
  getActiveMedications,
  createMedication,
  updateMedication,
  deleteMedication,
} from './medications';

export type { DbMedicationInsert, DbMedicationUpdate } from './medications';

// Allergies
export {
  getAllAllergies,
  getActiveAllergies,
  createAllergy,
  updateAllergy,
  deleteAllergy,
} from './allergies';

export type { DbAllergyInsert, DbAllergyUpdate } from './allergies';

// Vet Visits
export {
  getAllVetVisits,
  getVetVisitsRequiringFollowUp,
  createVetVisit,
  updateVetVisit,
  deleteVetVisit,
} from './vet-visits';

export type { DbVetVisitInsert, DbVetVisitUpdate } from './vet-visits';

// Health Statistics, Timeline & Search (cross-cuts the sub-tables)
export { getHealthStatistics, getHealthTimeline, searchHealthRecords } from './statistics';

// OFA Screenings
export {
  getAllOFAScreenings,
  getOFAScreeningById,
  createOFAScreening,
  updateOFAScreening,
  deleteOFAScreening,
} from './ofa-screenings';

export type { DbOFAScreeningInsert, DbOFAScreeningUpdate } from './ofa-screenings';

// Genetic Screenings
export {
  getAllGeneticScreenings,
  getGeneticScreeningById,
  createGeneticScreening,
  updateGeneticScreening,
  deleteGeneticScreening,
} from './genetic-screenings';

export type { DbGeneticScreeningInsert, DbGeneticScreeningUpdate } from './genetic-screenings';
