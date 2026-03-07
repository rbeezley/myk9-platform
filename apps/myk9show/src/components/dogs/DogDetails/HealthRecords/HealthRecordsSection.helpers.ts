/**
 * Helper functions for HealthRecordsSection
 */

import type { HealthEvent } from './HealthTimeline';
import type {
  VaccinationRecord,
  VetVisitRecord,
  MedicationRecord,
  AllergyRecord,
  OFAScreeningRecord,
  GeneticScreeningRecord,
} from '../../../../types/health';

/** Convert health records to timeline events */
export const convertToTimelineEvents = (
  vaccinations: VaccinationRecord[],
  vetVisits: VetVisitRecord[],
  medications: MedicationRecord[],
  allergies: AllergyRecord[],
  ofaScreenings: OFAScreeningRecord[],
  geneticScreenings: GeneticScreeningRecord[]
): HealthEvent[] => {
  const events: HealthEvent[] = [];

  vaccinations.forEach(vacc => {
    events.push({
      id: `vacc-${vacc.id}`,
      type: 'vaccination' as const,
      title: `${vacc.vaccine_name} Vaccination`,
      description: `Administered by ${vacc.vet_name || 'Unknown'}`,
      date: new Date(vacc.date_given),
      vetName: vacc.vet_name || '',
      clinic: vacc.clinic_name || '',
      status:
        vacc.expiration_date && new Date(vacc.expiration_date) < new Date()
          ? 'overdue'
          : 'completed',
      expiration: vacc.expiration_date ? new Date(vacc.expiration_date) : undefined,
      notes: vacc.notes || '',
      attachments: [],
    });
  });

  vetVisits.forEach(visit => {
    events.push({
      id: `visit-${visit.id}`,
      type: 'vet_visit' as const,
      title: visit.reason,
      description: visit.notes || 'Routine visit',
      date: new Date(visit.visit_date),
      vetName: visit.vet_name || '',
      clinic: visit.clinic_name || '',
      cost: visit.cost || 0,
      status: 'completed' as const,
      notes: visit.notes || '',
      attachments: [],
    });
  });

  medications.forEach(med => {
    events.push({
      id: `med-${med.id}`,
      type: 'medication' as const,
      title: med.medication_name,
      description: `${med.dosage || ''} - ${med.frequency || ''}`,
      date: med.start_date ? new Date(med.start_date) : new Date(),
      vetName: med.frequency || '',
      status: 'scheduled' as const,
      notes: med.notes || '',
      attachments: [],
    });
  });

  allergies.forEach(allergy => {
    events.push({
      id: `allergy-${allergy.id}`,
      type: 'allergy' as const,
      title: `${allergy.allergen} Allergy`,
      description: allergy.reaction || '',
      date: allergy.discovered_date ? new Date(allergy.discovered_date) : new Date(),
      vetName: allergy.discovered_by || '',
      status: 'completed' as const,
      notes: allergy.reaction || '',
      attachments: [],
    });
  });

  ofaScreenings.forEach(ofa => {
    events.push({
      id: `ofa-${ofa.id}`,
      type: 'vaccination' as const, // Reuse closest timeline icon type
      title: `OFA ${ofa.test_type.charAt(0).toUpperCase() + ofa.test_type.slice(1)} Screening`,
      description: `Status: ${ofa.status}${ofa.result ? ` — ${ofa.result}` : ''}`,
      date: new Date(ofa.test_date),
      vetName: ofa.veterinarian || '',
      status: ofa.status === 'pending' ? 'scheduled' : 'completed',
      notes: ofa.notes || '',
      attachments: [],
    });
  });

  geneticScreenings.forEach(gen => {
    const markerCount = gen.results.length;
    events.push({
      id: `genetic-${gen.id}`,
      type: 'vaccination' as const, // Reuse closest timeline icon type
      title: `${gen.provider} Genetic Test`,
      description: `${markerCount} marker${markerCount !== 1 ? 's' : ''} tested`,
      date: new Date(gen.test_date),
      vetName: gen.provider,
      status: 'completed' as const,
      notes: gen.notes || '',
      attachments: [],
    });
  });

  return events.sort((a, b) => b.date.getTime() - a.date.getTime());
};

/** Check for upcoming/overdue vaccinations */
export const getVaccinationAlerts = (vaccinations: VaccinationRecord[]): VaccinationRecord[] => {
  const now = new Date();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(now.getDate() + 30);

  return vaccinations.filter(v => {
    if (!v.expiration_date) return false;
    const exp = new Date(v.expiration_date);
    return exp <= thirtyDaysFromNow;
  });
};
