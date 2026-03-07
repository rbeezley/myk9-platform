// React Query hooks for health database operations
// Phase 4.2: Health Records System Integration
import { useQuery } from '@tanstack/react-query';
import {
  getAllHealthRecords,
  getHealthRecordById,
  getAllVaccinations,
  getVaccinationById,
  getUpcomingVaccinations,
  getAllMedications,
  getActiveMedications,
  getAllAllergies,
  getActiveAllergies,
  getAllVetVisits,
  getVetVisitsRequiringFollowUp,
  getAllOFAScreenings,
  getAllGeneticScreenings,
  getHealthStatistics,
  getHealthTimeline,
  searchHealthRecords,
} from '@/services/database/queries/healthQueries';

import {
  mapDbHealthRecordToApp,
  mapDbVaccinationToApp,
  mapDbMedicationToApp,
  mapDbAllergyToApp,
  mapDbVetVisitToApp,
  mapDbOFAScreeningToApp,
  mapDbGeneticScreeningToApp,
  generateHealthAlerts,
} from '@/services/mappers/healthMappers';

import type { HealthFilters } from '@/types/health';

import { healthQueryKeys, healthCacheStrategies } from './useHealthDatabase.keys';

// Re-export keys, cache strategies, and all mutations so consumers can import from this file
export { healthQueryKeys, healthCacheStrategies } from './useHealthDatabase.keys';
export {
  useCreateHealthRecordMutation,
  useUpdateHealthRecordMutation,
  useDeleteHealthRecordMutation,
  useCreateVaccinationMutation,
  useUpdateVaccinationMutation,
  useDeleteVaccinationMutation,
  useCreateMedicationMutation,
  useUpdateMedicationMutation,
  useDeleteMedicationMutation,
  useCreateAllergyMutation,
  useUpdateAllergyMutation,
  useDeleteAllergyMutation,
  useCreateVetVisitMutation,
  useUpdateVetVisitMutation,
  useDeleteVetVisitMutation,
  useCreateOFAScreeningMutation,
  useUpdateOFAScreeningMutation,
  useDeleteOFAScreeningMutation,
  useCreateGeneticScreeningMutation,
  useUpdateGeneticScreeningMutation,
  useDeleteGeneticScreeningMutation,
} from './useHealthDatabase.mutations';

// ========================================
// HEALTH RECORDS HOOKS
// ========================================

export const useHealthRecordsQuery = (dogId?: string) => {
  return useQuery({
    queryKey: dogId ? healthQueryKeys.dogHealthRecords(dogId) : healthQueryKeys.healthRecords(),
    queryFn: async () => {
      const { data, error } = await getAllHealthRecords(dogId);
      if (error) throw error;
      return data?.map(mapDbHealthRecordToApp) || [];
    },
    ...healthCacheStrategies.moderate,
  });
};

export const useHealthRecordQuery = (id: string, enabled = true) => {
  return useQuery({
    queryKey: healthQueryKeys.healthRecord(id),
    queryFn: async () => {
      const { data, error } = await getHealthRecordById(id);
      if (error) throw error;
      return data ? mapDbHealthRecordToApp(data) : null;
    },
    enabled: !!id && enabled,
    ...healthCacheStrategies.moderate,
  });
};

// ========================================
// VACCINATION HOOKS
// ========================================

export const useVaccinationsQuery = (dogId?: string) => {
  return useQuery({
    queryKey: dogId ? healthQueryKeys.dogVaccinations(dogId) : healthQueryKeys.vaccinations(),
    queryFn: async () => {
      const { data, error } = await getAllVaccinations(dogId);
      if (error) throw error;
      return data?.map(mapDbVaccinationToApp) || [];
    },
    ...healthCacheStrategies.moderate,
  });
};

export const useVaccinationQuery = (id: string, enabled = true) => {
  return useQuery({
    queryKey: healthQueryKeys.vaccination(id),
    queryFn: async () => {
      const { data, error } = await getVaccinationById(id);
      if (error) throw error;
      return data ? mapDbVaccinationToApp(data) : null;
    },
    enabled: !!id && enabled,
    ...healthCacheStrategies.moderate,
  });
};

export const useUpcomingVaccinationsQuery = (dogId?: string) => {
  return useQuery({
    queryKey: healthQueryKeys.upcomingVaccinations(dogId),
    queryFn: async () => {
      const { data, error } = await getUpcomingVaccinations(dogId);
      if (error) throw error;
      return data?.map(mapDbVaccinationToApp) || [];
    },
    ...healthCacheStrategies.realtime, // More frequent updates for time-sensitive data
  });
};

// ========================================
// MEDICATION HOOKS
// ========================================

export const useMedicationsQuery = (dogId?: string) => {
  return useQuery({
    queryKey: dogId ? healthQueryKeys.dogMedications(dogId) : healthQueryKeys.medications(),
    queryFn: async () => {
      const { data, error } = await getAllMedications(dogId);
      if (error) throw error;
      return data?.map(mapDbMedicationToApp) || [];
    },
    ...healthCacheStrategies.moderate,
  });
};

export const useActiveMedicationsQuery = (dogId?: string) => {
  return useQuery({
    queryKey: healthQueryKeys.activeMedications(dogId),
    queryFn: async () => {
      const { data, error } = await getActiveMedications(dogId);
      if (error) throw error;
      return data?.map(mapDbMedicationToApp) || [];
    },
    ...healthCacheStrategies.realtime,
  });
};

// ========================================
// ALLERGY HOOKS
// ========================================

export const useAllergiesQuery = (dogId?: string) => {
  return useQuery({
    queryKey: dogId ? healthQueryKeys.dogAllergies(dogId) : healthQueryKeys.allergies(),
    queryFn: async () => {
      const { data, error } = await getAllAllergies(dogId);
      if (error) throw error;
      return data?.map(mapDbAllergyToApp) || [];
    },
    ...healthCacheStrategies.stable, // Allergies change less frequently
  });
};

export const useActiveAllergiesQuery = (dogId?: string) => {
  return useQuery({
    queryKey: healthQueryKeys.activeAllergies(dogId),
    queryFn: async () => {
      const { data, error } = await getActiveAllergies(dogId);
      if (error) throw error;
      return data?.map(mapDbAllergyToApp) || [];
    },
    ...healthCacheStrategies.stable,
  });
};

// ========================================
// VET VISIT HOOKS
// ========================================

export const useVetVisitsQuery = (dogId?: string) => {
  return useQuery({
    queryKey: dogId ? healthQueryKeys.dogVetVisits(dogId) : healthQueryKeys.vetVisits(),
    queryFn: async () => {
      const { data, error } = await getAllVetVisits(dogId);
      if (error) throw error;
      return data?.map(mapDbVetVisitToApp) || [];
    },
    ...healthCacheStrategies.moderate,
  });
};

export const useFollowUpVisitsQuery = (dogId?: string) => {
  return useQuery({
    queryKey: healthQueryKeys.followUpVisits(dogId),
    queryFn: async () => {
      const { data, error } = await getVetVisitsRequiringFollowUp(dogId);
      if (error) throw error;
      return data?.map(mapDbVetVisitToApp) || [];
    },
    ...healthCacheStrategies.realtime,
  });
};

// ========================================
// OFA SCREENING HOOKS
// ========================================

export const useOFAScreeningsQuery = (dogId?: string) => {
  return useQuery({
    queryKey: dogId ? healthQueryKeys.dogOFAScreenings(dogId) : healthQueryKeys.ofaScreenings(),
    queryFn: async () => {
      const { data, error } = await getAllOFAScreenings(dogId);
      if (error) throw error;
      return data?.map(mapDbOFAScreeningToApp) || [];
    },
    ...healthCacheStrategies.stable,
  });
};

// ========================================
// GENETIC SCREENING HOOKS
// ========================================

export const useGeneticScreeningsQuery = (dogId?: string) => {
  return useQuery({
    queryKey: dogId
      ? healthQueryKeys.dogGeneticScreenings(dogId)
      : healthQueryKeys.geneticScreenings(),
    queryFn: async () => {
      const { data, error } = await getAllGeneticScreenings(dogId);
      if (error) throw error;
      return data?.map(mapDbGeneticScreeningToApp) || [];
    },
    ...healthCacheStrategies.stable,
  });
};

// ========================================
// ANALYTICS HOOKS
// ========================================

export const useHealthStatisticsQuery = (dogId: string, enabled = true) => {
  return useQuery({
    queryKey: healthQueryKeys.healthStatistics(dogId),
    queryFn: async () => {
      const { data, error } = await getHealthStatistics(dogId);
      if (error) throw error;
      return data;
    },
    enabled: !!dogId && enabled,
    ...healthCacheStrategies.moderate,
  });
};

export const useHealthTimelineQuery = (dogId: string, filters?: HealthFilters, enabled = true) => {
  return useQuery({
    queryKey: healthQueryKeys.healthTimeline(dogId, filters),
    queryFn: async () => {
      const { data, error } = await getHealthTimeline(dogId, filters);
      if (error) throw error;
      return data || [];
    },
    enabled: !!dogId && enabled,
    ...healthCacheStrategies.moderate,
  });
};

export const useHealthAlertsQuery = (dogId: string, enabled = true) => {
  return useQuery({
    queryKey: healthQueryKeys.healthAlerts(dogId),
    queryFn: async () => {
      // Get all relevant data to generate alerts
      const [vaccinationsResult, medicationsResult, vetVisitsResult] = await Promise.all([
        getAllVaccinations(dogId),
        getAllMedications(dogId),
        getAllVetVisits(dogId),
      ]);

      if (vaccinationsResult.error || medicationsResult.error || vetVisitsResult.error) {
        throw vaccinationsResult.error || medicationsResult.error || vetVisitsResult.error;
      }

      return generateHealthAlerts(
        vaccinationsResult.data || [],
        medicationsResult.data || [],
        vetVisitsResult.data || [],
        dogId
      );
    },
    enabled: !!dogId && enabled,
    ...healthCacheStrategies.realtime, // Alerts need to be current
  });
};

export const useHealthSearchQuery = (
  dogId: string,
  searchTerm: string,
  filters?: HealthFilters,
  enabled = true
) => {
  return useQuery({
    queryKey: healthQueryKeys.healthSearch(dogId, searchTerm, filters),
    queryFn: async () => {
      const { data, error } = await searchHealthRecords(dogId, searchTerm, filters);
      if (error) throw error;
      return data || [];
    },
    enabled: !!dogId && !!searchTerm && enabled,
    ...healthCacheStrategies.moderate,
  });
};

// ========================================
// CONVENIENCE HOOKS
// ========================================

// Hook for all health data for a specific dog
export const useDogHealthDataQuery = (dogId: string, enabled = true) => {
  const vaccinations = useVaccinationsQuery(dogId);
  const medications = useMedicationsQuery(dogId);
  const allergies = useAllergiesQuery(dogId);
  const vetVisits = useVetVisitsQuery(dogId);
  const ofaScreenings = useOFAScreeningsQuery(dogId);
  const geneticScreenings = useGeneticScreeningsQuery(dogId);
  const statistics = useHealthStatisticsQuery(dogId, enabled);
  const alerts = useHealthAlertsQuery(dogId, enabled);

  return {
    vaccinations,
    medications,
    allergies,
    vetVisits,
    ofaScreenings,
    geneticScreenings,
    statistics,
    alerts,
    isLoading:
      vaccinations.isLoading ||
      medications.isLoading ||
      allergies.isLoading ||
      vetVisits.isLoading ||
      ofaScreenings.isLoading ||
      geneticScreenings.isLoading,
    isError:
      vaccinations.isError ||
      medications.isError ||
      allergies.isError ||
      vetVisits.isError ||
      ofaScreenings.isError ||
      geneticScreenings.isError,
    error:
      vaccinations.error ||
      medications.error ||
      allergies.error ||
      vetVisits.error ||
      ofaScreenings.error ||
      geneticScreenings.error,
  };
};
