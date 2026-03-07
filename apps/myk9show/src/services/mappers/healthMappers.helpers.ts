// Health timeline, alerts, statistics, and utility mappers
// Extracted from healthMappers.ts to keep files under 500 lines

import type { DbVaccination, DbMedication, DbAllergy, DbVetVisit } from '@/types/database-mappings';
import type { HealthTimelineEntry, HealthAlert, HealthStatistics } from '@/types/health';

import {
  mapDbVaccinationToApp,
  mapDbMedicationToApp,
  mapDbAllergyToApp,
  mapDbVetVisitToApp,
} from './healthMappers';

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
    const isOverdue =
      vaccination.expiration_date && new Date(vaccination.expiration_date) < new Date();
    timelineEntries.push({
      id: vaccination.id,
      type: 'vaccination',
      date: vaccination.date_administered,
      title: `${vaccination.vaccine_name} Vaccination`,
      details: mapDbVaccinationToApp(vaccination),
      dog_id: dogId,
      ...(vaccination.administered_by != null
        ? { description: `Administered by ${vaccination.administered_by}` }
        : {}),
      ...(isOverdue != null ? { urgent: Boolean(isOverdue) } : {}),
      ...(isOverdue ? { status: 'overdue' as const } : { status: 'completed' as const }),
    });
  });

  // Map medications
  medications.forEach(medication => {
    timelineEntries.push({
      id: medication.id,
      type: 'medication',
      date: medication.start_date ?? medication.created_at ?? new Date().toISOString(),
      title: medication.medication_name,
      details: mapDbMedicationToApp(medication),
      dog_id: dogId,
      urgent: false,
      status: 'completed',
      ...(medication.prescribing_vet != null
        ? { description: `Prescribed by ${medication.prescribing_vet}` }
        : {}),
    });
  });

  // Map allergies
  allergies.forEach(allergy => {
    const isSevere = allergy.severity === 'severe' || allergy.severity === 'life_threatening';
    timelineEntries.push({
      id: allergy.id,
      type: 'allergy',
      date: allergy.diagnosed_date ?? allergy.created_at ?? new Date().toISOString(),
      title: `Allergy: ${allergy.allergen}`,
      details: mapDbAllergyToApp(allergy),
      dog_id: dogId,
      urgent: isSevere,
      status: 'completed',
      ...(allergy.severity != null ? { description: `Severity: ${allergy.severity}` } : {}),
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
      details: mapDbVetVisitToApp(visit),
      dog_id: dogId,
      urgent: hasFollowUp,
      ...(hasFollowUp ? { status: 'upcoming' as const } : { status: 'completed' as const }),
      ...(visit.vet_name != null ? { description: `Seen by ${visit.vet_name}` } : {}),
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
        const daysUntilDue = Math.ceil(
          (expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );
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
        const daysUntilFollowUp = Math.ceil(
          (followUpDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );
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
  const upcomingVaccinations = vaccinations.filter(
    v =>
      v.expiration_date &&
      new Date(v.expiration_date) <= thirtyDaysFromNow &&
      new Date(v.expiration_date) >= now
  );

  const overdueVaccinations = vaccinations.filter(
    v => v.expiration_date && new Date(v.expiration_date) < now
  );

  // Medication statistics
  const activeMedications = medications.filter(m => m.is_active);

  // Allergy statistics (all allergies are considered active since DB has no is_active column)
  const activeAllergies = allergies;

  // Vet visit statistics (follow_up_date presence indicates follow-up is needed)
  const followUpVisits = vetVisits.filter(
    v => v.follow_up_date && new Date(v.follow_up_date) >= now
  );

  // Find dates
  const sortedVetVisits = vetVisits
    .filter(v => v.visit_date)
    .sort((a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime());

  const nextVaccination = upcomingVaccinations.sort(
    (a, b) => new Date(a.expiration_date!).getTime() - new Date(b.expiration_date!).getTime()
  )[0];

  const lastVisitDate = sortedVetVisits[0]?.visit_date;
  const nextVaccinationDue = nextVaccination?.expiration_date;

  return {
    total_vaccinations: vaccinations.length,
    upcoming_vaccinations: upcomingVaccinations.length,
    overdue_vaccinations: overdueVaccinations.length,
    active_medications: activeMedications.length,
    total_allergies: activeAllergies.length,
    total_vet_visits: vetVisits.length,
    upcoming_appointments: followUpVisits.length,
    ...(lastVisitDate != null ? { last_visit_date: lastVisitDate } : {}),
    ...(nextVaccinationDue != null ? { next_vaccination_due: nextVaccinationDue } : {}),
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

  return typeMap[type] ?? type;
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

  return colorMap[severity ?? ''] ?? 'gray';
};

export const mapStatusToColor = (status?: string): string => {
  const colorMap: Record<string, string> = {
    completed: 'green',
    scheduled: 'blue',
    overdue: 'red',
    upcoming: 'yellow',
  };

  return colorMap[status ?? ''] ?? 'gray';
};
