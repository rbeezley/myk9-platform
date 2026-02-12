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
} from '@/types/database-mappings';
import type {
  HealthRecord,
  VaccinationRecord,
  MedicationRecord,
  AllergyRecord,
  VetVisitRecord,
  HealthTimelineEntry,
  HealthAlert,
  HealthStatistics
} from '@/types/health';

// ========================================
// HEALTH RECORD MAPPERS
// ========================================

export const mapDbHealthRecordToApp = (dbRecord: DbHealthRecord): HealthRecord => {
  return {
    id: dbRecord.id,
    dog_id: dbRecord.dog_id || '',
    record_type: dbRecord.record_type as 'vaccination' | 'medication' | 'allergy' | 'vet_visit' | 'general',
    title: dbRecord.title || undefined,
    notes: dbRecord.description || undefined,
    created_at: dbRecord.created_at || new Date().toISOString(),
    updated_at: dbRecord.updated_at || new Date().toISOString(),
  };
};

export const mapAppHealthRecordToDbInsert = (appRecord: Omit<HealthRecord, 'id' | 'created_at' | 'updated_at'>): DbHealthRecordInsert => {
  return {
    dog_id: appRecord.dog_id,
    record_type: appRecord.record_type,
    date: new Date().toISOString().split('T')[0],
    title: appRecord.title || 'Health Record',
    description: appRecord.notes || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
};

export const mapAppHealthRecordToDbUpdate = (appRecord: Partial<HealthRecord>): DbHealthRecordUpdate => {
  const update: DbHealthRecordUpdate = {
    updated_at: new Date().toISOString(),
  };

  if (appRecord.record_type !== undefined) update.record_type = appRecord.record_type;
  if (appRecord.title !== undefined) update.title = appRecord.title;
  if (appRecord.notes !== undefined) update.description = appRecord.notes || null;

  return update;
};

// ========================================
// VACCINATION MAPPERS
// ========================================

export const mapDbVaccinationToApp = (dbVaccination: DbVaccination): VaccinationRecord => {
  return {
    id: dbVaccination.id,
    dog_id: dbVaccination.dog_id || '',
    vaccine_name: dbVaccination.vaccine_name,
    date_given: dbVaccination.date_administered,
    expiration_date: dbVaccination.expiration_date || undefined,
    vet_name: dbVaccination.administered_by || undefined,
    lot_number: dbVaccination.lot_number || undefined,
    notes: dbVaccination.notes || undefined,
    created_at: dbVaccination.created_at || new Date().toISOString(),
    updated_at: dbVaccination.updated_at || new Date().toISOString(),
  };
};

export const mapAppVaccinationToDbInsert = (appVaccination: Omit<VaccinationRecord, 'id' | 'created_at' | 'updated_at'>): DbVaccinationInsert => {
  return {
    dog_id: appVaccination.dog_id,
    vaccine_name: appVaccination.vaccine_name,
    date_administered: appVaccination.date_given,
    expiration_date: appVaccination.expiration_date || null,
    administered_by: appVaccination.vet_name || null,
    lot_number: appVaccination.lot_number || null,
    notes: appVaccination.notes || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
};

export const mapAppVaccinationToDbUpdate = (appVaccination: Partial<VaccinationRecord>): DbVaccinationUpdate => {
  const update: DbVaccinationUpdate = {
    updated_at: new Date().toISOString(),
  };

  if (appVaccination.vaccine_name !== undefined) update.vaccine_name = appVaccination.vaccine_name;
  if (appVaccination.date_given !== undefined) update.date_administered = appVaccination.date_given;
  if (appVaccination.expiration_date !== undefined) update.expiration_date = appVaccination.expiration_date || null;
  if (appVaccination.vet_name !== undefined) update.administered_by = appVaccination.vet_name || null;
  if (appVaccination.lot_number !== undefined) update.lot_number = appVaccination.lot_number || null;
  if (appVaccination.notes !== undefined) update.notes = appVaccination.notes || null;

  return update;
};

// ========================================
// MEDICATION MAPPERS
// ========================================

export const mapDbMedicationToApp = (dbMedication: DbMedication): MedicationRecord => {
  return {
    id: dbMedication.id,
    dog_id: dbMedication.dog_id || '',
    medication_name: dbMedication.medication_name,
    dosage: dbMedication.dosage || undefined,
    frequency: dbMedication.frequency || undefined,
    prescribed_by: dbMedication.prescribing_vet || undefined,
    start_date: dbMedication.start_date || undefined,
    end_date: dbMedication.end_date || undefined,
    is_active: dbMedication.is_active ?? undefined,
    notes: dbMedication.reason || undefined,
    created_at: dbMedication.created_at || new Date().toISOString(),
    updated_at: dbMedication.updated_at || new Date().toISOString(),
  };
};

export const mapAppMedicationToDbInsert = (appMedication: Omit<MedicationRecord, 'id' | 'created_at' | 'updated_at'>): DbMedicationInsert => {
  return {
    dog_id: appMedication.dog_id,
    medication_name: appMedication.medication_name,
    dosage: appMedication.dosage || null,
    frequency: appMedication.frequency || null,
    prescribing_vet: appMedication.prescribed_by || null,
    start_date: appMedication.start_date || null,
    end_date: appMedication.end_date || null,
    is_active: appMedication.is_active ?? true,
    reason: appMedication.notes || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
};

export const mapAppMedicationToDbUpdate = (appMedication: Partial<MedicationRecord>): DbMedicationUpdate => {
  const update: DbMedicationUpdate = {
    updated_at: new Date().toISOString(),
  };

  if (appMedication.medication_name !== undefined) update.medication_name = appMedication.medication_name;
  if (appMedication.dosage !== undefined) update.dosage = appMedication.dosage || null;
  if (appMedication.frequency !== undefined) update.frequency = appMedication.frequency || null;
  if (appMedication.prescribed_by !== undefined) update.prescribing_vet = appMedication.prescribed_by || null;
  if (appMedication.start_date !== undefined) update.start_date = appMedication.start_date || null;
  if (appMedication.end_date !== undefined) update.end_date = appMedication.end_date || null;
  if (appMedication.is_active !== undefined) update.is_active = appMedication.is_active;
  if (appMedication.notes !== undefined) update.reason = appMedication.notes || null;

  return update;
};

// ========================================
// ALLERGY MAPPERS
// ========================================

export const mapDbAllergyToApp = (dbAllergy: DbAllergy): AllergyRecord => {
  return {
    id: dbAllergy.id,
    dog_id: dbAllergy.dog_id || '',
    allergen: dbAllergy.allergen,
    reaction: dbAllergy.reaction || undefined,
    severity: dbAllergy.severity as 'mild' | 'moderate' | 'severe' | 'life_threatening' | undefined,
    discovered_date: dbAllergy.diagnosed_date || undefined,
    notes: dbAllergy.notes || undefined,
    created_at: dbAllergy.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
};

export const mapAppAllergyToDbInsert = (appAllergy: Omit<AllergyRecord, 'id' | 'created_at' | 'updated_at'>): DbAllergyInsert => {
  return {
    dog_id: appAllergy.dog_id,
    allergen: appAllergy.allergen,
    reaction: appAllergy.reaction || null,
    severity: appAllergy.severity || null,
    diagnosed_date: appAllergy.discovered_date || null,
    notes: appAllergy.notes || null,
    created_at: new Date().toISOString(),
  };
};

export const mapAppAllergyToDbUpdate = (appAllergy: Partial<AllergyRecord>): DbAllergyUpdate => {
  const update: DbAllergyUpdate = {};

  if (appAllergy.allergen !== undefined) update.allergen = appAllergy.allergen;
  if (appAllergy.reaction !== undefined) update.reaction = appAllergy.reaction || null;
  if (appAllergy.severity !== undefined) update.severity = appAllergy.severity || null;
  if (appAllergy.discovered_date !== undefined) update.diagnosed_date = appAllergy.discovered_date || null;
  if (appAllergy.notes !== undefined) update.notes = appAllergy.notes || null;

  return update;
};

// ========================================
// VET VISIT MAPPERS
// ========================================

export const mapDbVetVisitToApp = (dbVetVisit: DbVetVisit): VetVisitRecord => {
  return {
    id: dbVetVisit.id,
    dog_id: dbVetVisit.dog_id || '',
    visit_date: dbVetVisit.visit_date,
    reason: dbVetVisit.reason,
    diagnosis: dbVetVisit.diagnosis || undefined,
    treatment: dbVetVisit.treatment || undefined,
    vet_name: dbVetVisit.vet_name || undefined,
    clinic_name: dbVetVisit.clinic_name || undefined,
    cost: dbVetVisit.cost || undefined,
    follow_up_date: dbVetVisit.follow_up_date || undefined,
    notes: dbVetVisit.notes || undefined,
    created_at: dbVetVisit.created_at || new Date().toISOString(),
    updated_at: dbVetVisit.updated_at || new Date().toISOString(),
  };
};

export const mapAppVetVisitToDbInsert = (appVetVisit: Omit<VetVisitRecord, 'id' | 'created_at' | 'updated_at'>): DbVetVisitInsert => {
  return {
    dog_id: appVetVisit.dog_id,
    visit_date: appVetVisit.visit_date,
    reason: appVetVisit.reason,
    diagnosis: appVetVisit.diagnosis || null,
    treatment: appVetVisit.treatment || null,
    vet_name: appVetVisit.vet_name || null,
    clinic_name: appVetVisit.clinic_name || null,
    cost: appVetVisit.cost || null,
    follow_up_date: appVetVisit.follow_up_date || null,
    notes: appVetVisit.notes || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
};

export const mapAppVetVisitToDbUpdate = (appVetVisit: Partial<VetVisitRecord>): DbVetVisitUpdate => {
  const update: DbVetVisitUpdate = {
    updated_at: new Date().toISOString(),
  };

  if (appVetVisit.visit_date !== undefined) update.visit_date = appVetVisit.visit_date;
  if (appVetVisit.reason !== undefined) update.reason = appVetVisit.reason;
  if (appVetVisit.diagnosis !== undefined) update.diagnosis = appVetVisit.diagnosis || null;
  if (appVetVisit.treatment !== undefined) update.treatment = appVetVisit.treatment || null;
  if (appVetVisit.vet_name !== undefined) update.vet_name = appVetVisit.vet_name || null;
  if (appVetVisit.clinic_name !== undefined) update.clinic_name = appVetVisit.clinic_name || null;
  if (appVetVisit.cost !== undefined) update.cost = appVetVisit.cost || null;
  if (appVetVisit.follow_up_date !== undefined) update.follow_up_date = appVetVisit.follow_up_date || null;
  if (appVetVisit.notes !== undefined) update.notes = appVetVisit.notes || null;

  return update;
};

// ========================================
// HEALTH TIMELINE MAPPERS
// ========================================

export const mapDbRecordsToHealthTimeline = (
  vaccinations: DbVaccination[] = [],
  medications: DbMedication[] = [],
  allergies: DbAllergy[] = [],
  vetVisits: DbVetVisit[] = [],
  dogId: string
): HealthTimelineEntry[] => {
  const timelineEntries: HealthTimelineEntry[] = [];

  // Map vaccinations
  vaccinations.forEach(vaccination => {
    const isOverdue = vaccination.expiration_date && new Date(vaccination.expiration_date) < new Date();
    timelineEntries.push({
      id: vaccination.id,
      type: 'vaccination',
      date: vaccination.date_administered,
      title: `${vaccination.vaccine_name} Vaccination`,
      description: vaccination.administered_by ? `Administered by ${vaccination.administered_by}` : undefined,
      details: mapDbVaccinationToApp(vaccination),
      dog_id: dogId,
      urgent: Boolean(isOverdue),
      status: isOverdue ? 'overdue' : 'completed',
    });
  });

  // Map medications
  medications.forEach(medication => {
    timelineEntries.push({
      id: medication.id,
      type: 'medication',
      date: medication.start_date || medication.created_at || new Date().toISOString(),
      title: medication.medication_name,
      description: medication.prescribing_vet ? `Prescribed by ${medication.prescribing_vet}` : undefined,
      details: mapDbMedicationToApp(medication),
      dog_id: dogId,
      urgent: false,
      status: medication.is_active ? 'completed' : 'completed',
    });
  });

  // Map allergies
  allergies.forEach(allergy => {
    const isSevere = allergy.severity === 'severe' || allergy.severity === 'life_threatening';
    timelineEntries.push({
      id: allergy.id,
      type: 'allergy',
      date: allergy.diagnosed_date || allergy.created_at || new Date().toISOString(),
      title: `Allergy: ${allergy.allergen}`,
      description: allergy.severity ? `Severity: ${allergy.severity}` : undefined,
      details: mapDbAllergyToApp(allergy),
      dog_id: dogId,
      urgent: isSevere,
      status: 'completed',
    });
  });

  // Map vet visits
  vetVisits.forEach(visit => {
    const hasFollowUp = Boolean(visit.follow_up_date);
    timelineEntries.push({
      id: visit.id,
      type: 'vet_visit',
      date: visit.visit_date,
      title: `Vet Visit: ${visit.reason}`,
      description: visit.vet_name ? `Seen by ${visit.vet_name}` : undefined,
      details: mapDbVetVisitToApp(visit),
      dog_id: dogId,
      urgent: hasFollowUp,
      status: hasFollowUp ? 'upcoming' : 'completed',
    });
  });

  // Sort by date (most recent first)
  return timelineEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

// ========================================
// HEALTH ALERT GENERATION
// ========================================

export const generateHealthAlerts = (
  vaccinations: DbVaccination[] = [],
  medications: DbMedication[] = [],
  vetVisits: DbVetVisit[] = [],
  dogId: string
): HealthAlert[] => {
  const alerts: HealthAlert[] = [];
  const now = new Date();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(now.getDate() + 30);

  // Vaccination alerts
  vaccinations.forEach(vaccination => {
    if (vaccination.expiration_date) {
      const expirationDate = new Date(vaccination.expiration_date);
      
      if (expirationDate < now) {
        // Overdue vaccination
        alerts.push({
          id: `vaccination-overdue-${vaccination.id}`,
          dog_id: dogId,
          type: 'vaccination_due',
          title: 'Vaccination Overdue',
          message: `${vaccination.vaccine_name} vaccination expired on ${vaccination.expiration_date}`,
          due_date: vaccination.expiration_date,
          severity: 'critical',
          is_active: true,
          related_record_id: vaccination.id,
          related_record_type: 'vaccination',
          created_at: new Date().toISOString(),
        });
      } else if (expirationDate <= thirtyDaysFromNow) {
        // Upcoming vaccination
        const daysUntilDue = Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        alerts.push({
          id: `vaccination-due-${vaccination.id}`,
          dog_id: dogId,
          type: 'vaccination_due',
          title: 'Vaccination Due Soon',
          message: `${vaccination.vaccine_name} vaccination due in ${daysUntilDue} days`,
          due_date: vaccination.expiration_date,
          severity: daysUntilDue <= 7 ? 'high' : 'medium',
          is_active: true,
          related_record_id: vaccination.id,
          related_record_type: 'vaccination',
          created_at: new Date().toISOString(),
        });
      }
    }
  });

  // Medication alerts
  medications.forEach(medication => {
    if (medication.is_active && medication.end_date) {
      const endDate = new Date(medication.end_date);
      
      if (endDate <= thirtyDaysFromNow) {
        const daysUntilEnd = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        alerts.push({
          id: `medication-ending-${medication.id}`,
          dog_id: dogId,
          type: 'medication_reminder',
          title: 'Medication Ending Soon',
          message: `${medication.medication_name} treatment ends in ${daysUntilEnd} days`,
          due_date: medication.end_date,
          severity: daysUntilEnd <= 3 ? 'high' : 'medium',
          is_active: true,
          related_record_id: medication.id,
          related_record_type: 'medication',
          created_at: new Date().toISOString(),
        });
      }
    }
  });

  // Vet visit follow-up alerts (follow_up_date presence indicates follow-up is needed)
  vetVisits.forEach(visit => {
    if (visit.follow_up_date) {
      const followUpDate = new Date(visit.follow_up_date);

      if (followUpDate < now) {
        // Overdue follow-up
        alerts.push({
          id: `follow-up-overdue-${visit.id}`,
          dog_id: dogId,
          type: 'follow_up_required',
          title: 'Follow-up Overdue',
          message: `Follow-up appointment for ${visit.reason} was due on ${visit.follow_up_date}`,
          due_date: visit.follow_up_date,
          severity: 'high',
          is_active: true,
          related_record_id: visit.id,
          related_record_type: 'vet_visit',
          created_at: new Date().toISOString(),
        });
      } else if (followUpDate <= thirtyDaysFromNow) {
        // Upcoming follow-up
        const daysUntilFollowUp = Math.ceil((followUpDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        alerts.push({
          id: `follow-up-due-${visit.id}`,
          dog_id: dogId,
          type: 'follow_up_required',
          title: 'Follow-up Appointment Due',
          message: `Follow-up appointment for ${visit.reason} due in ${daysUntilFollowUp} days`,
          due_date: visit.follow_up_date,
          severity: daysUntilFollowUp <= 7 ? 'medium' : 'low',
          is_active: true,
          related_record_id: visit.id,
          related_record_type: 'vet_visit',
          created_at: new Date().toISOString(),
        });
      }
    }
  });

  // Sort alerts by severity and due date
  return alerts.sort((a, b) => {
    const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];
    if (severityDiff !== 0) return severityDiff;
    
    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
  });
};

// ========================================
// HEALTH STATISTICS MAPPERS
// ========================================

export const calculateHealthStatisticsFromDb = (
  vaccinations: DbVaccination[] = [],
  medications: DbMedication[] = [],
  allergies: DbAllergy[] = [],
  vetVisits: DbVetVisit[] = []
): HealthStatistics => {
  const now = new Date();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(now.getDate() + 30);

  // Vaccination statistics
  const upcomingVaccinations = vaccinations.filter(v => 
    v.expiration_date && 
    new Date(v.expiration_date) <= thirtyDaysFromNow && 
    new Date(v.expiration_date) >= now
  );
  
  const overdueVaccinations = vaccinations.filter(v => 
    v.expiration_date && new Date(v.expiration_date) < now
  );

  // Medication statistics
  const activeMedications = medications.filter(m => m.is_active);

  // Allergy statistics (all allergies are considered active since DB has no is_active column)
  const activeAllergies = allergies;

  // Vet visit statistics (follow_up_date presence indicates follow-up is needed)
  const followUpVisits = vetVisits.filter(v =>
    v.follow_up_date &&
    new Date(v.follow_up_date) >= now
  );

  // Find dates
  const sortedVetVisits = vetVisits
    .filter(v => v.visit_date)
    .sort((a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime());
  
  const nextVaccination = upcomingVaccinations
    .sort((a, b) => new Date(a.expiration_date!).getTime() - new Date(b.expiration_date!).getTime())[0];

  return {
    total_vaccinations: vaccinations.length,
    upcoming_vaccinations: upcomingVaccinations.length,
    overdue_vaccinations: overdueVaccinations.length,
    active_medications: activeMedications.length,
    total_allergies: activeAllergies.length,
    total_vet_visits: vetVisits.length,
    upcoming_appointments: followUpVisits.length,
    last_visit_date: sortedVetVisits[0]?.visit_date,
    next_vaccination_due: nextVaccination?.expiration_date || undefined,
  };
};

// ========================================
// UTILITY MAPPERS
// ========================================

export const mapHealthRecordTypeToDisplayName = (type: string): string => {
  const typeMap: Record<string, string> = {
    vaccination: 'Vaccination',
    medication: 'Medication',
    allergy: 'Allergy',
    vet_visit: 'Vet Visit',
    health_record: 'Health Record',
    general: 'General Record',
  };
  
  return typeMap[type] || type;
};

export const mapSeverityToColor = (severity?: string): string => {
  const colorMap: Record<string, string> = {
    mild: 'green',
    moderate: 'yellow',
    severe: 'orange',
    life_threatening: 'red',
    low: 'blue',
    medium: 'yellow',
    high: 'orange',
    critical: 'red',
  };
  
  return colorMap[severity || ''] || 'gray';
};

export const mapStatusToColor = (status?: string): string => {
  const colorMap: Record<string, string> = {
    completed: 'green',
    scheduled: 'blue',
    overdue: 'red',
    upcoming: 'yellow',
  };
  
  return colorMap[status || ''] || 'gray';
};