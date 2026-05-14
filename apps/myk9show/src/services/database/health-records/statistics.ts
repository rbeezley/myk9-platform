// ========================================
// HEALTH STATISTICS, TIMELINE & SEARCH
// ========================================

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import { sanitizePostgRESTFilter } from '@/utils/sanitizePostgRESTFilter';
import type { HealthFilters, HealthStatistics } from '@/types/health';
import { getAllVaccinations, getUpcomingVaccinations } from './vaccinations';
import { getAllMedications, getActiveMedications } from './medications';
import { getAllAllergies, getActiveAllergies } from './allergies';
import { getAllVetVisits, getVetVisitsRequiringFollowUp } from './vet-visits';

// ========================================
// HEALTH STATISTICS & ANALYTICS
// ========================================

export const getHealthStatistics = async (
  dogId: string
): Promise<{ data: HealthStatistics | null; error: unknown }> => {
  const startTime = Date.now();

  try {
    // Get vaccination stats
    const { data: vaccinations } = await getAllVaccinations(dogId);
    const { data: upcomingVaccinations } = await getUpcomingVaccinations(dogId);
    const overdueVaccinations =
      vaccinations?.filter(v => v.expiration_date && new Date(v.expiration_date) < new Date()) ||
      [];

    // Get medication stats
    const { data: activeMedications } = await getActiveMedications(dogId);

    // Get allergy stats
    const { data: allergies } = await getActiveAllergies(dogId);

    // Get vet visit stats
    const { data: vetVisits } = await getAllVetVisits(dogId);
    const { data: followUpVisits } = await getVetVisitsRequiringFollowUp(dogId);

    // Calculate next vaccination due
    const nextVaccination = upcomingVaccinations?.[0];

    // Get last visit date
    const lastVisit = vetVisits?.[0];

    const statistics: HealthStatistics = {
      total_vaccinations: vaccinations?.length || 0,
      upcoming_vaccinations: upcomingVaccinations?.length || 0,
      overdue_vaccinations: overdueVaccinations.length,
      active_medications: activeMedications?.length || 0,
      total_allergies: allergies?.length || 0,
      total_vet_visits: vetVisits?.length || 0,
      upcoming_appointments: followUpVisits?.length || 0,
      last_visit_date: lastVisit?.visit_date,
      next_vaccination_due: nextVaccination?.expiration_date || undefined,
    };

    const duration = Date.now() - startTime;
    logQuery('health_statistics', 'calculate', duration);

    return { data: statistics, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'health_statistics', 'calculate');
    logQuery('health_statistics', 'calculate', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// ========================================
// COMPREHENSIVE HEALTH TIMELINE
// ========================================

export const getHealthTimeline = async (dogId: string, filters?: HealthFilters) => {
  const startTime = Date.now();

  try {
    const timelineEntries: Array<{
      id: string;
      type: 'vaccination' | 'medication' | 'allergy' | 'vet_visit';
      date: string;
      title: string;
      description?: string;
      details: unknown;
      dog_id: string;
      urgent?: boolean;
      status?: string;
    }> = [];

    // Get all health records if requested
    if (!filters?.record_type || filters.record_type.includes('vaccination')) {
      const { data: vaccinations } = await getAllVaccinations(dogId);
      vaccinations?.forEach(vaccination => {
        timelineEntries.push({
          id: vaccination.id,
          type: 'vaccination' as const,
          date: vaccination.date_administered,
          title: `${vaccination.vaccine_name} Vaccination`,
          ...(vaccination.administered_by && {
            description: `Administered by ${vaccination.administered_by}`,
          }),
          details: vaccination,
          dog_id: dogId,
          urgent: !!(
            vaccination.expiration_date && new Date(vaccination.expiration_date) < new Date()
          ),
          status:
            vaccination.expiration_date && new Date(vaccination.expiration_date) < new Date()
              ? 'overdue'
              : 'completed',
        });
      });
    }

    if (!filters?.record_type || filters.record_type.includes('medication')) {
      const { data: medications } = await getAllMedications(dogId);
      medications?.forEach(medication => {
        timelineEntries.push({
          id: medication.id,
          type: 'medication' as const,
          date: medication.start_date || medication.created_at!,
          title: `${medication.medication_name}`,
          ...(medication.prescribing_vet && {
            description: `Prescribed by ${medication.prescribing_vet}`,
          }),
          details: medication,
          dog_id: dogId,
          urgent: false,
          status: medication.is_active ? 'completed' : 'completed',
        });
      });
    }

    if (!filters?.record_type || filters.record_type.includes('allergy')) {
      const { data: allergies } = await getAllAllergies(dogId);
      allergies?.forEach(allergy => {
        timelineEntries.push({
          id: allergy.id,
          type: 'allergy' as const,
          date: allergy.diagnosed_date || allergy.created_at || new Date().toISOString(),
          title: `Allergy: ${allergy.allergen}`,
          ...(allergy.severity && { description: `Severity: ${allergy.severity}` }),
          details: allergy,
          dog_id: dogId,
          urgent: allergy.severity === 'severe' || allergy.severity === 'life_threatening',
          status: 'completed',
        });
      });
    }

    if (!filters?.record_type || filters.record_type.includes('vet_visit')) {
      const { data: vetVisits } = await getAllVetVisits(dogId);
      vetVisits?.forEach(visit => {
        timelineEntries.push({
          id: visit.id,
          type: 'vet_visit' as const,
          date: visit.visit_date,
          title: `Vet Visit: ${visit.reason}`,
          ...(visit.vet_name && { description: `Seen by ${visit.vet_name}` }),
          details: visit,
          dog_id: dogId,
          urgent: !!visit.follow_up_date,
          status: visit.follow_up_date ? 'upcoming' : 'completed',
        });
      });
    }

    // Apply date filters
    let filteredEntries = timelineEntries;
    if (filters?.date_range) {
      filteredEntries = timelineEntries.filter(entry => {
        const entryDate = new Date(entry.date);
        const startDate = new Date(filters.date_range!.start);
        const endDate = new Date(filters.date_range!.end);
        return entryDate >= startDate && entryDate <= endDate;
      });
    }

    // Sort by date (most recent first)
    filteredEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const duration = Date.now() - startTime;
    logQuery('health_timeline', 'select_comprehensive', duration);

    return { data: filteredEntries, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'health_timeline', 'select_comprehensive');
    logQuery('health_timeline', 'select_comprehensive', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// ========================================
// SEARCH FUNCTIONS
// ========================================

export const searchHealthRecords = async (
  dogId: string,
  searchTerm: string,
  filters?: HealthFilters
) => {
  const startTime = Date.now();

  try {
    const results: Array<{
      id: string;
      type: 'vaccination' | 'medication' | 'allergy' | 'vet_visit';
      title: string;
      date: string;
      details: unknown;
    }> = [];

    // Search vaccinations
    if (!filters?.record_type || filters.record_type.includes('vaccination')) {
      const { data: vaccinations } = await supabase
        .from('vaccinations')
        .select('*')
        .eq('dog_id', dogId)
        .or(
          `vaccine_name.ilike.%${sanitizePostgRESTFilter(searchTerm)}%,administered_by.ilike.%${sanitizePostgRESTFilter(searchTerm)}%,notes.ilike.%${sanitizePostgRESTFilter(searchTerm)}%`
        );

      vaccinations?.forEach(vaccination => {
        results.push({
          id: vaccination.id,
          type: 'vaccination' as const,
          title: `${vaccination.vaccine_name} Vaccination`,
          date: vaccination.date_administered,
          details: vaccination,
        });
      });
    }

    // Search medications
    if (!filters?.record_type || filters.record_type.includes('medication')) {
      const { data: medications } = await supabase
        .from('medications')
        .select('*')
        .eq('dog_id', dogId)
        .or(
          `medication_name.ilike.%${sanitizePostgRESTFilter(searchTerm)}%,prescribing_vet.ilike.%${sanitizePostgRESTFilter(searchTerm)}%,reason.ilike.%${sanitizePostgRESTFilter(searchTerm)}%,notes.ilike.%${sanitizePostgRESTFilter(searchTerm)}%`
        );

      medications?.forEach(medication => {
        results.push({
          id: medication.id,
          type: 'medication' as const,
          title: medication.medication_name,
          date: medication.start_date || medication.created_at!,
          details: medication,
        });
      });
    }

    // Search allergies
    if (!filters?.record_type || filters.record_type.includes('allergy')) {
      const { data: allergies } = await supabase
        .from('allergies')
        .select('*')
        .eq('dog_id', dogId)
        .or(
          `allergen.ilike.%${sanitizePostgRESTFilter(searchTerm)}%,reaction.ilike.%${sanitizePostgRESTFilter(searchTerm)}%,notes.ilike.%${sanitizePostgRESTFilter(searchTerm)}%`
        );

      allergies?.forEach(allergy => {
        results.push({
          id: allergy.id,
          type: 'allergy' as const,
          title: `Allergy: ${allergy.allergen}`,
          date: allergy.diagnosed_date || allergy.created_at || new Date().toISOString(),
          details: allergy,
        });
      });
    }

    // Search vet visits
    if (!filters?.record_type || filters.record_type.includes('vet_visit')) {
      const { data: vetVisits } = await supabase
        .from('vet_visits')
        .select('*')
        .eq('dog_id', dogId)
        .or(
          `reason.ilike.%${sanitizePostgRESTFilter(searchTerm)}%,diagnosis.ilike.%${sanitizePostgRESTFilter(searchTerm)}%,treatment.ilike.%${sanitizePostgRESTFilter(searchTerm)}%,vet_name.ilike.%${sanitizePostgRESTFilter(searchTerm)}%,clinic_name.ilike.%${sanitizePostgRESTFilter(searchTerm)}%,notes.ilike.%${sanitizePostgRESTFilter(searchTerm)}%`
        );

      vetVisits?.forEach(visit => {
        results.push({
          id: visit.id,
          type: 'vet_visit' as const,
          title: `Vet Visit: ${visit.reason}`,
          date: visit.visit_date,
          details: visit,
        });
      });
    }

    // Sort by date (most recent first)
    results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const duration = Date.now() - startTime;
    logQuery('health_search', 'search_all', duration);

    return { data: results, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'health_search', 'search_all');
    logQuery('health_search', 'search_all', duration, dbError.message);
    return { data: [], error: dbError };
  }
};
