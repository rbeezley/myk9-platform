// React Query hooks for health database operations
// Phase 4.2: Health Records System Integration
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  // Health Records
  getAllHealthRecords,
  getHealthRecordById,
  createHealthRecord,
  updateHealthRecord,
  deleteHealthRecord,
  
  // Vaccinations
  getAllVaccinations,
  getVaccinationById,
  createVaccination,
  updateVaccination,
  deleteVaccination,
  getUpcomingVaccinations,
  
  // Medications
  getAllMedications,
  getActiveMedications,
  createMedication,
  updateMedication,
  deleteMedication,
  
  // Allergies
  getAllAllergies,
  getActiveAllergies,
  createAllergy,
  updateAllergy,
  deleteAllergy,
  
  // Vet Visits
  getAllVetVisits,
  getVetVisitsRequiringFollowUp,
  createVetVisit,
  updateVetVisit,
  deleteVetVisit,
  
  // Analytics
  getHealthStatistics,
  getHealthTimeline,
  searchHealthRecords
} from '@/services/database/queries/healthQueries';

import { 
  mapDbHealthRecordToApp,
  mapAppHealthRecordToDbInsert,
  mapAppHealthRecordToDbUpdate,
  mapDbVaccinationToApp,
  mapAppVaccinationToDbInsert,
  mapAppVaccinationToDbUpdate,
  mapDbMedicationToApp,
  mapAppMedicationToDbInsert,
  mapAppMedicationToDbUpdate,
  mapDbAllergyToApp,
  mapAppAllergyToDbInsert,
  mapAppAllergyToDbUpdate,
  mapDbVetVisitToApp,
  mapAppVetVisitToDbInsert,
  mapAppVetVisitToDbUpdate,
  generateHealthAlerts
} from '@/services/mappers/healthMappers';

import type { 
  HealthRecord, 
  VaccinationRecord, 
  MedicationRecord, 
  AllergyRecord, 
  VetVisitRecord,
  HealthFilters
} from '@/types/health';

// Query key factory
export const healthQueryKeys = {
  all: ['health'] as const,
  
  // Health Records
  healthRecords: () => [...healthQueryKeys.all, 'records'] as const,
  healthRecord: (id: string) => [...healthQueryKeys.healthRecords(), id] as const,
  dogHealthRecords: (dogId: string) => [...healthQueryKeys.healthRecords(), 'dog', dogId] as const,
  
  // Vaccinations
  vaccinations: () => [...healthQueryKeys.all, 'vaccinations'] as const,
  vaccination: (id: string) => [...healthQueryKeys.vaccinations(), id] as const,
  dogVaccinations: (dogId: string) => [...healthQueryKeys.vaccinations(), 'dog', dogId] as const,
  upcomingVaccinations: (dogId?: string) => [...healthQueryKeys.vaccinations(), 'upcoming', dogId] as const,
  
  // Medications
  medications: () => [...healthQueryKeys.all, 'medications'] as const,
  medication: (id: string) => [...healthQueryKeys.medications(), id] as const,
  dogMedications: (dogId: string) => [...healthQueryKeys.medications(), 'dog', dogId] as const,
  activeMedications: (dogId?: string) => [...healthQueryKeys.medications(), 'active', dogId] as const,
  
  // Allergies
  allergies: () => [...healthQueryKeys.all, 'allergies'] as const,
  allergy: (id: string) => [...healthQueryKeys.allergies(), id] as const,
  dogAllergies: (dogId: string) => [...healthQueryKeys.allergies(), 'dog', dogId] as const,
  activeAllergies: (dogId?: string) => [...healthQueryKeys.allergies(), 'active', dogId] as const,
  
  // Vet Visits
  vetVisits: () => [...healthQueryKeys.all, 'vet-visits'] as const,
  vetVisit: (id: string) => [...healthQueryKeys.vetVisits(), id] as const,
  dogVetVisits: (dogId: string) => [...healthQueryKeys.vetVisits(), 'dog', dogId] as const,
  followUpVisits: (dogId?: string) => [...healthQueryKeys.vetVisits(), 'follow-up', dogId] as const,
  
  // Analytics
  healthStatistics: (dogId: string) => [...healthQueryKeys.all, 'statistics', dogId] as const,
  healthTimeline: (dogId: string, filters?: HealthFilters) => [...healthQueryKeys.all, 'timeline', dogId, filters] as const,
  healthAlerts: (dogId: string) => [...healthQueryKeys.all, 'alerts', dogId] as const,
  healthSearch: (dogId: string, searchTerm: string, filters?: HealthFilters) => [...healthQueryKeys.all, 'search', dogId, searchTerm, filters] as const,
};

// Cache strategies
const cacheStrategies = {
  realtime: { staleTime: 0, gcTime: 1000 * 60 * 5 }, // 5 minutes cache
  moderate: { staleTime: 1000 * 60 * 5, gcTime: 1000 * 60 * 10 }, // 5 min stale, 10 min cache
  stable: { staleTime: 1000 * 60 * 15, gcTime: 1000 * 60 * 30 }, // 15 min stale, 30 min cache
};

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
    ...cacheStrategies.moderate,
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
    ...cacheStrategies.moderate,
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
    ...cacheStrategies.moderate,
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
    ...cacheStrategies.moderate,
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
    ...cacheStrategies.realtime, // More frequent updates for time-sensitive data
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
    ...cacheStrategies.moderate,
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
    ...cacheStrategies.realtime,
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
    ...cacheStrategies.stable, // Allergies change less frequently
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
    ...cacheStrategies.stable,
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
    ...cacheStrategies.moderate,
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
    ...cacheStrategies.realtime,
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
    ...cacheStrategies.moderate,
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
    ...cacheStrategies.moderate,
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
        getAllVetVisits(dogId)
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
    ...cacheStrategies.realtime, // Alerts need to be current
  });
};

export const useHealthSearchQuery = (dogId: string, searchTerm: string, filters?: HealthFilters, enabled = true) => {
  return useQuery({
    queryKey: healthQueryKeys.healthSearch(dogId, searchTerm, filters),
    queryFn: async () => {
      const { data, error } = await searchHealthRecords(dogId, searchTerm, filters);
      if (error) throw error;
      return data || [];
    },
    enabled: !!dogId && !!searchTerm && enabled,
    ...cacheStrategies.moderate,
  });
};

// ========================================
// MUTATION HOOKS
// ========================================

// Health Record Mutations
export const useCreateHealthRecordMutation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (healthRecord: Omit<HealthRecord, 'id' | 'created_at' | 'updated_at'>) => {
      const dbInsert = mapAppHealthRecordToDbInsert(healthRecord);
      const { data, error } = await createHealthRecord(dbInsert);
      if (error) throw error;
      return data ? mapDbHealthRecordToApp(data) : null;
    },
    onSuccess: (data) => {
      if (data) {
        // Invalidate relevant queries
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthRecords() });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.dogHealthRecords(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthStatistics(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthTimeline(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthAlerts(data.dog_id) });
      }
    },
  });
};

export const useUpdateHealthRecordMutation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<HealthRecord> }) => {
      const dbUpdate = mapAppHealthRecordToDbUpdate(updates);
      const { data, error } = await updateHealthRecord(id, dbUpdate);
      if (error) throw error;
      return data ? mapDbHealthRecordToApp(data) : null;
    },
    onSuccess: (data) => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthRecord(data.id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.dogHealthRecords(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthStatistics(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthTimeline(data.dog_id) });
      }
    },
  });
};

export const useDeleteHealthRecordMutation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await deleteHealthRecord(id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      // Invalidate all health queries since we don't know the dog_id
      queryClient.invalidateQueries({ queryKey: healthQueryKeys.all });
    },
  });
};

// Vaccination Mutations
export const useCreateVaccinationMutation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (vaccination: Omit<VaccinationRecord, 'id' | 'created_at' | 'updated_at'>) => {
      const dbInsert = mapAppVaccinationToDbInsert(vaccination);
      const { data, error } = await createVaccination(dbInsert);
      if (error) throw error;
      return data ? mapDbVaccinationToApp(data) : null;
    },
    onSuccess: (data) => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.vaccinations() });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.dogVaccinations(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.upcomingVaccinations() });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.upcomingVaccinations(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthStatistics(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthTimeline(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthAlerts(data.dog_id) });
      }
    },
  });
};

export const useUpdateVaccinationMutation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<VaccinationRecord> }) => {
      const dbUpdate = mapAppVaccinationToDbUpdate(updates);
      const { data, error } = await updateVaccination(id, dbUpdate);
      if (error) throw error;
      return data ? mapDbVaccinationToApp(data) : null;
    },
    onSuccess: (data) => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.vaccination(data.id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.dogVaccinations(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.upcomingVaccinations() });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.upcomingVaccinations(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthStatistics(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthTimeline(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthAlerts(data.dog_id) });
      }
    },
  });
};

export const useDeleteVaccinationMutation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await deleteVaccination(id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthQueryKeys.vaccinations() });
      queryClient.invalidateQueries({ queryKey: healthQueryKeys.upcomingVaccinations() });
      queryClient.invalidateQueries({ queryKey: healthQueryKeys.all });
    },
  });
};

// Medication Mutations
export const useCreateMedicationMutation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (medication: Omit<MedicationRecord, 'id' | 'created_at' | 'updated_at'>) => {
      const dbInsert = mapAppMedicationToDbInsert(medication);
      const { data, error } = await createMedication(dbInsert);
      if (error) throw error;
      return data ? mapDbMedicationToApp(data) : null;
    },
    onSuccess: (data) => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.medications() });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.dogMedications(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.activeMedications() });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.activeMedications(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthStatistics(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthTimeline(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthAlerts(data.dog_id) });
      }
    },
  });
};

export const useUpdateMedicationMutation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<MedicationRecord> }) => {
      const dbUpdate = mapAppMedicationToDbUpdate(updates);
      const { data, error } = await updateMedication(id, dbUpdate);
      if (error) throw error;
      return data ? mapDbMedicationToApp(data) : null;
    },
    onSuccess: (data) => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.dogMedications(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.activeMedications() });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.activeMedications(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthStatistics(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthTimeline(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthAlerts(data.dog_id) });
      }
    },
  });
};

export const useDeleteMedicationMutation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await deleteMedication(id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthQueryKeys.medications() });
      queryClient.invalidateQueries({ queryKey: healthQueryKeys.activeMedications() });
      queryClient.invalidateQueries({ queryKey: healthQueryKeys.all });
    },
  });
};

// Allergy Mutations
export const useCreateAllergyMutation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (allergy: Omit<AllergyRecord, 'id' | 'created_at' | 'updated_at'>) => {
      const dbInsert = mapAppAllergyToDbInsert(allergy);
      const { data, error } = await createAllergy(dbInsert);
      if (error) throw error;
      return data ? mapDbAllergyToApp(data) : null;
    },
    onSuccess: (data) => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.allergies() });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.dogAllergies(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.activeAllergies() });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.activeAllergies(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthStatistics(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthTimeline(data.dog_id) });
      }
    },
  });
};

export const useUpdateAllergyMutation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<AllergyRecord> }) => {
      const dbUpdate = mapAppAllergyToDbUpdate(updates);
      const { data, error } = await updateAllergy(id, dbUpdate);
      if (error) throw error;
      return data ? mapDbAllergyToApp(data) : null;
    },
    onSuccess: (data) => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.dogAllergies(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.activeAllergies() });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.activeAllergies(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthStatistics(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthTimeline(data.dog_id) });
      }
    },
  });
};

export const useDeleteAllergyMutation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await deleteAllergy(id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthQueryKeys.allergies() });
      queryClient.invalidateQueries({ queryKey: healthQueryKeys.activeAllergies() });
      queryClient.invalidateQueries({ queryKey: healthQueryKeys.all });
    },
  });
};

// Vet Visit Mutations
export const useCreateVetVisitMutation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (vetVisit: Omit<VetVisitRecord, 'id' | 'created_at' | 'updated_at'>) => {
      const dbInsert = mapAppVetVisitToDbInsert(vetVisit);
      const { data, error } = await createVetVisit(dbInsert);
      if (error) throw error;
      return data ? mapDbVetVisitToApp(data) : null;
    },
    onSuccess: (data) => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.vetVisits() });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.dogVetVisits(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.followUpVisits() });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.followUpVisits(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthStatistics(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthTimeline(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthAlerts(data.dog_id) });
      }
    },
  });
};

export const useUpdateVetVisitMutation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<VetVisitRecord> }) => {
      const dbUpdate = mapAppVetVisitToDbUpdate(updates);
      const { data, error } = await updateVetVisit(id, dbUpdate);
      if (error) throw error;
      return data ? mapDbVetVisitToApp(data) : null;
    },
    onSuccess: (data) => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.dogVetVisits(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.followUpVisits() });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.followUpVisits(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthStatistics(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthTimeline(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthAlerts(data.dog_id) });
      }
    },
  });
};

export const useDeleteVetVisitMutation = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await deleteVetVisit(id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthQueryKeys.vetVisits() });
      queryClient.invalidateQueries({ queryKey: healthQueryKeys.followUpVisits() });
      queryClient.invalidateQueries({ queryKey: healthQueryKeys.all });
    },
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
  const statistics = useHealthStatisticsQuery(dogId, enabled);
  const alerts = useHealthAlertsQuery(dogId, enabled);

  return {
    vaccinations,
    medications,
    allergies,
    vetVisits,
    statistics,
    alerts,
    isLoading: vaccinations.isLoading || medications.isLoading || allergies.isLoading || vetVisits.isLoading,
    isError: vaccinations.isError || medications.isError || allergies.isError || vetVisits.isError,
    error: vaccinations.error || medications.error || allergies.error || vetVisits.error,
  };
};