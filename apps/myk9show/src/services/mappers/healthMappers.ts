// Health records data mappers - transform between database and application types
import type {
  DbHealthRecord,
  DbHealthRecordInsert,
  DbHealthRecordUpdate,
  DbVaccination,
  DbVaccinationInsert,
  DbVaccinationUpdate,
  DbMedication,
  DbMedicationInsert,
  DbMedicationUpdate,
  DbAllergy,
  DbAllergyInsert,
  DbAllergyUpdate,
  DbVetVisit,
  DbVetVisitInsert,
  DbVetVisitUpdate,
  DbOFAScreening,
  DbOFAScreeningInsert,
  DbOFAScreeningUpdate,
  DbGeneticScreening,
  DbGeneticScreeningInsert,
  DbGeneticScreeningUpdate,
} from '@/types/database-mappings';
import type { Json } from '@/types/supabase';
import type {
  HealthRecord,
  VaccinationRecord,
  MedicationRecord,
  AllergyRecord,
  VetVisitRecord,
  OFAScreeningRecord,
  GeneticScreeningRecord,
} from '@/types/health';

import {
  isHealthRecordType,
  isAllergySeverity,
  isOFATestType,
  isOFAStatus,
} from './healthMappers.types';

// Re-export types and validation for backward compatibility
export type {
  HealthRecordType,
  AllergySeverity,
  OFATestType,
  OFAStatus,
} from './healthMappers.types';
export {
  isHealthRecordType,
  isAllergySeverity,
  isOFATestType,
  isOFAStatus,
  HEALTH_RECORD_TYPES,
  ALLERGY_SEVERITIES,
  OFA_TEST_TYPES,
  OFA_STATUSES,
} from './healthMappers.types';

// Re-export helpers for backward compatibility
export {
  mapDbRecordsToHealthTimeline,
  generateHealthAlerts,
  calculateHealthStatisticsFromDb,
  mapHealthRecordTypeToDisplayName,
  mapSeverityToColor,
  mapStatusToColor,
} from './healthMappers.helpers';

// ========================================
// HEALTH RECORD MAPPERS
// ========================================

export const mapDbHealthRecordToApp = (dbRecord: DbHealthRecord): HealthRecord => {
  return {
    id: dbRecord.id,
    dog_id: dbRecord.dog_id,
    record_type: isHealthRecordType(dbRecord.record_type) ? dbRecord.record_type : 'general',
    created_at: dbRecord.created_at ?? new Date().toISOString(),
    updated_at: dbRecord.updated_at ?? new Date().toISOString(),
    ...(dbRecord.title ? { title: dbRecord.title } : {}),
    ...(dbRecord.description != null ? { notes: dbRecord.description } : {}),
  };
};

export const mapAppHealthRecordToDbInsert = (
  appRecord: Omit<HealthRecord, 'id' | 'created_at' | 'updated_at'>
): DbHealthRecordInsert => {
  return {
    dog_id: appRecord.dog_id,
    record_type: appRecord.record_type,
    date: new Date().toISOString().split('T')[0],
    title: appRecord.title ?? 'Health Record',
    description: appRecord.notes ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
};

export const mapAppHealthRecordToDbUpdate = (
  appRecord: Partial<HealthRecord>
): DbHealthRecordUpdate => {
  const update: DbHealthRecordUpdate = {
    updated_at: new Date().toISOString(),
  };

  if (appRecord.record_type !== undefined) update.record_type = appRecord.record_type;
  if (appRecord.title !== undefined) update.title = appRecord.title;
  if (appRecord.notes !== undefined) update.description = appRecord.notes ?? null;

  return update;
};

// ========================================
// VACCINATION MAPPERS
// ========================================

export const mapDbVaccinationToApp = (dbVaccination: DbVaccination): VaccinationRecord => {
  return {
    id: dbVaccination.id,
    dog_id: dbVaccination.dog_id,
    vaccine_name: dbVaccination.vaccine_name,
    date_given: dbVaccination.date_administered,
    created_at: dbVaccination.created_at ?? new Date().toISOString(),
    updated_at: dbVaccination.updated_at ?? new Date().toISOString(),
    ...(dbVaccination.expiration_date != null
      ? { expiration_date: dbVaccination.expiration_date }
      : {}),
    ...(dbVaccination.administered_by != null ? { vet_name: dbVaccination.administered_by } : {}),
    ...(dbVaccination.lot_number != null ? { lot_number: dbVaccination.lot_number } : {}),
    ...(dbVaccination.notes != null ? { notes: dbVaccination.notes } : {}),
  };
};

export const mapAppVaccinationToDbInsert = (
  appVaccination: Omit<VaccinationRecord, 'id' | 'created_at' | 'updated_at'>
): DbVaccinationInsert => {
  return {
    dog_id: appVaccination.dog_id,
    vaccine_name: appVaccination.vaccine_name,
    date_administered: appVaccination.date_given,
    expiration_date: appVaccination.expiration_date ?? null,
    administered_by: appVaccination.vet_name ?? null,
    lot_number: appVaccination.lot_number ?? null,
    notes: appVaccination.notes ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
};

export const mapAppVaccinationToDbUpdate = (
  appVaccination: Partial<VaccinationRecord>
): DbVaccinationUpdate => {
  const update: DbVaccinationUpdate = {
    updated_at: new Date().toISOString(),
  };

  if (appVaccination.vaccine_name !== undefined) update.vaccine_name = appVaccination.vaccine_name;
  if (appVaccination.date_given !== undefined) update.date_administered = appVaccination.date_given;
  if (appVaccination.expiration_date !== undefined)
    update.expiration_date = appVaccination.expiration_date ?? null;
  if (appVaccination.vet_name !== undefined)
    update.administered_by = appVaccination.vet_name ?? null;
  if (appVaccination.lot_number !== undefined)
    update.lot_number = appVaccination.lot_number ?? null;
  if (appVaccination.notes !== undefined) update.notes = appVaccination.notes ?? null;

  return update;
};

// ========================================
// MEDICATION MAPPERS
// ========================================

export const mapDbMedicationToApp = (dbMedication: DbMedication): MedicationRecord => {
  return {
    id: dbMedication.id,
    dog_id: dbMedication.dog_id,
    medication_name: dbMedication.medication_name,
    created_at: dbMedication.created_at ?? new Date().toISOString(),
    updated_at: dbMedication.updated_at ?? new Date().toISOString(),
    ...(dbMedication.dosage != null ? { dosage: dbMedication.dosage } : {}),
    ...(dbMedication.frequency != null ? { frequency: dbMedication.frequency } : {}),
    ...(dbMedication.prescribing_vet != null
      ? { prescribed_by: dbMedication.prescribing_vet }
      : {}),
    ...(dbMedication.start_date != null ? { start_date: dbMedication.start_date } : {}),
    ...(dbMedication.end_date != null ? { end_date: dbMedication.end_date } : {}),
    ...(dbMedication.is_active != null ? { is_active: dbMedication.is_active } : {}),
    ...(dbMedication.reason != null ? { notes: dbMedication.reason } : {}),
  };
};

export const mapAppMedicationToDbInsert = (
  appMedication: Omit<MedicationRecord, 'id' | 'created_at' | 'updated_at'>
): DbMedicationInsert => {
  return {
    dog_id: appMedication.dog_id,
    medication_name: appMedication.medication_name,
    dosage: appMedication.dosage ?? null,
    frequency: appMedication.frequency ?? null,
    prescribing_vet: appMedication.prescribed_by ?? null,
    start_date: appMedication.start_date ?? null,
    end_date: appMedication.end_date ?? null,
    is_active: appMedication.is_active ?? true,
    reason: appMedication.notes ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
};

export const mapAppMedicationToDbUpdate = (
  appMedication: Partial<MedicationRecord>
): DbMedicationUpdate => {
  const update: DbMedicationUpdate = {
    updated_at: new Date().toISOString(),
  };

  if (appMedication.medication_name !== undefined)
    update.medication_name = appMedication.medication_name;
  if (appMedication.dosage !== undefined) update.dosage = appMedication.dosage ?? null;
  if (appMedication.frequency !== undefined) update.frequency = appMedication.frequency ?? null;
  if (appMedication.prescribed_by !== undefined)
    update.prescribing_vet = appMedication.prescribed_by ?? null;
  if (appMedication.start_date !== undefined) update.start_date = appMedication.start_date ?? null;
  if (appMedication.end_date !== undefined) update.end_date = appMedication.end_date ?? null;
  if (appMedication.is_active !== undefined) update.is_active = appMedication.is_active ?? null;
  if (appMedication.notes !== undefined) update.reason = appMedication.notes ?? null;

  return update;
};

// ========================================
// ALLERGY MAPPERS
// ========================================

export const mapDbAllergyToApp = (dbAllergy: DbAllergy): AllergyRecord => {
  return {
    id: dbAllergy.id,
    dog_id: dbAllergy.dog_id,
    allergen: dbAllergy.allergen,
    created_at: dbAllergy.created_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...(dbAllergy.reaction != null ? { reaction: dbAllergy.reaction } : {}),
    ...(dbAllergy.severity != null && isAllergySeverity(dbAllergy.severity)
      ? { severity: dbAllergy.severity }
      : {}),
    ...(dbAllergy.diagnosed_date != null ? { discovered_date: dbAllergy.diagnosed_date } : {}),
    ...(dbAllergy.notes != null ? { notes: dbAllergy.notes } : {}),
  };
};

export const mapAppAllergyToDbInsert = (
  appAllergy: Omit<AllergyRecord, 'id' | 'created_at' | 'updated_at'>
): DbAllergyInsert => {
  return {
    dog_id: appAllergy.dog_id,
    allergen: appAllergy.allergen,
    reaction: appAllergy.reaction ?? null,
    severity: appAllergy.severity ?? null,
    diagnosed_date: appAllergy.discovered_date ?? null,
    notes: appAllergy.notes ?? null,
    created_at: new Date().toISOString(),
  };
};

export const mapAppAllergyToDbUpdate = (appAllergy: Partial<AllergyRecord>): DbAllergyUpdate => {
  const update: DbAllergyUpdate = {};

  if (appAllergy.allergen !== undefined) update.allergen = appAllergy.allergen;
  if (appAllergy.reaction !== undefined) update.reaction = appAllergy.reaction ?? null;
  if (appAllergy.severity !== undefined) update.severity = appAllergy.severity ?? null;
  if (appAllergy.discovered_date !== undefined)
    update.diagnosed_date = appAllergy.discovered_date ?? null;
  if (appAllergy.notes !== undefined) update.notes = appAllergy.notes ?? null;

  return update;
};

// ========================================
// VET VISIT MAPPERS
// ========================================

export const mapDbVetVisitToApp = (dbVetVisit: DbVetVisit): VetVisitRecord => {
  return {
    id: dbVetVisit.id,
    dog_id: dbVetVisit.dog_id,
    visit_date: dbVetVisit.visit_date,
    reason: dbVetVisit.reason,
    created_at: dbVetVisit.created_at ?? new Date().toISOString(),
    updated_at: dbVetVisit.updated_at ?? new Date().toISOString(),
    ...(dbVetVisit.diagnosis != null ? { diagnosis: dbVetVisit.diagnosis } : {}),
    ...(dbVetVisit.treatment != null ? { treatment: dbVetVisit.treatment } : {}),
    ...(dbVetVisit.vet_name != null ? { vet_name: dbVetVisit.vet_name } : {}),
    ...(dbVetVisit.clinic_name != null ? { clinic_name: dbVetVisit.clinic_name } : {}),
    ...(dbVetVisit.cost != null ? { cost: dbVetVisit.cost } : {}),
    ...(dbVetVisit.follow_up_date != null ? { follow_up_date: dbVetVisit.follow_up_date } : {}),
    ...(dbVetVisit.notes != null ? { notes: dbVetVisit.notes } : {}),
  };
};

export const mapAppVetVisitToDbInsert = (
  appVetVisit: Omit<VetVisitRecord, 'id' | 'created_at' | 'updated_at'>
): DbVetVisitInsert => {
  return {
    dog_id: appVetVisit.dog_id,
    visit_date: appVetVisit.visit_date,
    reason: appVetVisit.reason,
    diagnosis: appVetVisit.diagnosis ?? null,
    treatment: appVetVisit.treatment ?? null,
    vet_name: appVetVisit.vet_name ?? null,
    clinic_name: appVetVisit.clinic_name ?? null,
    cost: appVetVisit.cost ?? null,
    follow_up_date: appVetVisit.follow_up_date ?? null,
    notes: appVetVisit.notes ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
};

export const mapAppVetVisitToDbUpdate = (
  appVetVisit: Partial<VetVisitRecord>
): DbVetVisitUpdate => {
  const update: DbVetVisitUpdate = {
    updated_at: new Date().toISOString(),
  };

  if (appVetVisit.visit_date !== undefined) update.visit_date = appVetVisit.visit_date;
  if (appVetVisit.reason !== undefined) update.reason = appVetVisit.reason;
  if (appVetVisit.diagnosis !== undefined) update.diagnosis = appVetVisit.diagnosis ?? null;
  if (appVetVisit.treatment !== undefined) update.treatment = appVetVisit.treatment ?? null;
  if (appVetVisit.vet_name !== undefined) update.vet_name = appVetVisit.vet_name ?? null;
  if (appVetVisit.clinic_name !== undefined) update.clinic_name = appVetVisit.clinic_name ?? null;
  if (appVetVisit.cost !== undefined) update.cost = appVetVisit.cost ?? null;
  if (appVetVisit.follow_up_date !== undefined)
    update.follow_up_date = appVetVisit.follow_up_date ?? null;
  if (appVetVisit.notes !== undefined) update.notes = appVetVisit.notes ?? null;

  return update;
};

// ========================================
// OFA SCREENING MAPPERS
// ========================================

export const mapDbOFAScreeningToApp = (db: DbOFAScreening): OFAScreeningRecord => ({
  id: db.id,
  dog_id: db.dog_id,
  owner_id: db.owner_id,
  test_type: isOFATestType(db.test_type) ? db.test_type : 'hips',
  test_date: db.test_date,
  status: isOFAStatus(db.status) ? db.status : 'pending',
  ...(db.result != null ? { result: db.result } : {}),
  ...(db.certification_number != null ? { certification_number: db.certification_number } : {}),
  ...(db.veterinarian != null ? { veterinarian: db.veterinarian } : {}),
  ...(db.notes != null ? { notes: db.notes } : {}),
  created_at: db.created_at,
  updated_at: db.updated_at,
});

export const mapAppOFAScreeningToDbInsert = (
  app: Omit<OFAScreeningRecord, 'id' | 'created_at' | 'updated_at'>
): DbOFAScreeningInsert => ({
  dog_id: app.dog_id,
  owner_id: app.owner_id,
  test_type: app.test_type,
  test_date: app.test_date,
  result: app.result ?? null,
  certification_number: app.certification_number ?? null,
  status: app.status,
  veterinarian: app.veterinarian ?? null,
  notes: app.notes ?? null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

export const mapAppOFAScreeningToDbUpdate = (
  app: Partial<OFAScreeningRecord>
): DbOFAScreeningUpdate => {
  const update: DbOFAScreeningUpdate = { updated_at: new Date().toISOString() };
  if (app.test_type !== undefined) update.test_type = app.test_type;
  if (app.test_date !== undefined) update.test_date = app.test_date;
  if (app.result !== undefined) update.result = app.result ?? null;
  if (app.certification_number !== undefined)
    update.certification_number = app.certification_number ?? null;
  if (app.status !== undefined) update.status = app.status;
  if (app.veterinarian !== undefined) update.veterinarian = app.veterinarian ?? null;
  if (app.notes !== undefined) update.notes = app.notes ?? null;
  return update;
};

// ========================================
// GENETIC SCREENING MAPPERS
// ========================================

export const mapDbGeneticScreeningToApp = (db: DbGeneticScreening): GeneticScreeningRecord => ({
  id: db.id,
  dog_id: db.dog_id,
  owner_id: db.owner_id,
  provider: db.provider,
  test_date: db.test_date,
  results: Array.isArray(db.results)
    ? (db.results as Array<{ marker: string; result: string; status?: string }>)
    : [],
  ...(db.notes != null ? { notes: db.notes } : {}),
  created_at: db.created_at,
  updated_at: db.updated_at,
});

export const mapAppGeneticScreeningToDbInsert = (
  app: Omit<GeneticScreeningRecord, 'id' | 'created_at' | 'updated_at'>
): DbGeneticScreeningInsert => ({
  dog_id: app.dog_id,
  owner_id: app.owner_id,
  provider: app.provider,
  test_date: app.test_date,
  results: app.results as unknown as Json,
  notes: app.notes ?? null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

export const mapAppGeneticScreeningToDbUpdate = (
  app: Partial<GeneticScreeningRecord>
): DbGeneticScreeningUpdate => {
  const update: DbGeneticScreeningUpdate = { updated_at: new Date().toISOString() };
  if (app.provider !== undefined) update.provider = app.provider;
  if (app.test_date !== undefined) update.test_date = app.test_date;
  if (app.results !== undefined) update.results = app.results as unknown as Json;
  if (app.notes !== undefined) update.notes = app.notes ?? null;
  return update;
};
