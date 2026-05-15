// Mutation hooks for health database operations
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createHealthRecord,
  updateHealthRecord,
  deleteHealthRecord,
  createVaccination,
  updateVaccination,
  deleteVaccination,
  createMedication,
  updateMedication,
  deleteMedication,
  createAllergy,
  updateAllergy,
  deleteAllergy,
  createVetVisit,
  updateVetVisit,
  deleteVetVisit,
  createOFAScreening,
  updateOFAScreening,
  deleteOFAScreening,
  createGeneticScreening,
  updateGeneticScreening,
  deleteGeneticScreening,
} from '@/services/database/health-records';

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
  mapDbOFAScreeningToApp,
  mapAppOFAScreeningToDbInsert,
  mapAppOFAScreeningToDbUpdate,
  mapDbGeneticScreeningToApp,
  mapAppGeneticScreeningToDbInsert,
  mapAppGeneticScreeningToDbUpdate,
} from '@/services/mappers/healthMappers';

import type {
  HealthRecord,
  VaccinationRecord,
  MedicationRecord,
  AllergyRecord,
  VetVisitRecord,
  OFAScreeningRecord,
  GeneticScreeningRecord,
} from '@/types/health';

import { healthQueryKeys } from './useHealthDatabase.keys';

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
    onSuccess: data => {
      if (data) {
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
    onSuccess: data => {
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
      queryClient.invalidateQueries({ queryKey: healthQueryKeys.all });
    },
  });
};

// Vaccination Mutations
export const useCreateVaccinationMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      vaccination: Omit<VaccinationRecord, 'id' | 'created_at' | 'updated_at'>
    ) => {
      const dbInsert = mapAppVaccinationToDbInsert(vaccination);
      const { data, error } = await createVaccination(dbInsert);
      if (error) throw error;
      return data ? mapDbVaccinationToApp(data) : null;
    },
    onSuccess: data => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.vaccinations() });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.dogVaccinations(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.upcomingVaccinations() });
        queryClient.invalidateQueries({
          queryKey: healthQueryKeys.upcomingVaccinations(data.dog_id),
        });
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
    onSuccess: data => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.vaccination(data.id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.dogVaccinations(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.upcomingVaccinations() });
        queryClient.invalidateQueries({
          queryKey: healthQueryKeys.upcomingVaccinations(data.dog_id),
        });
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
    onSuccess: data => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.medications() });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.dogMedications(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.activeMedications() });
        queryClient.invalidateQueries({
          queryKey: healthQueryKeys.activeMedications(data.dog_id),
        });
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
    onSuccess: data => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.dogMedications(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.activeMedications() });
        queryClient.invalidateQueries({
          queryKey: healthQueryKeys.activeMedications(data.dog_id),
        });
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
    onSuccess: data => {
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
    onSuccess: data => {
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
    onSuccess: data => {
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
    onSuccess: data => {
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
      queryClient.invalidateQueries({ queryKey: healthQueryKeys.all });
    },
  });
};

// OFA Screening Mutations
export const useCreateOFAScreeningMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (screening: Omit<OFAScreeningRecord, 'id' | 'created_at' | 'updated_at'>) => {
      const dbInsert = mapAppOFAScreeningToDbInsert(screening);
      const { data, error } = await createOFAScreening(dbInsert);
      if (error) throw error;
      return data ? mapDbOFAScreeningToApp(data) : null;
    },
    onSuccess: data => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.ofaScreenings() });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.dogOFAScreenings(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthStatistics(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthTimeline(data.dog_id) });
      }
    },
  });
};

export const useUpdateOFAScreeningMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<OFAScreeningRecord> }) => {
      const dbUpdate = mapAppOFAScreeningToDbUpdate(updates);
      const { data, error } = await updateOFAScreening(id, dbUpdate);
      if (error) throw error;
      return data ? mapDbOFAScreeningToApp(data) : null;
    },
    onSuccess: data => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.dogOFAScreenings(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthStatistics(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthTimeline(data.dog_id) });
      }
    },
  });
};

export const useDeleteOFAScreeningMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await deleteOFAScreening(id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthQueryKeys.all });
    },
  });
};

// Genetic Screening Mutations
export const useCreateGeneticScreeningMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      screening: Omit<GeneticScreeningRecord, 'id' | 'created_at' | 'updated_at'>
    ) => {
      const dbInsert = mapAppGeneticScreeningToDbInsert(screening);
      const { data, error } = await createGeneticScreening(dbInsert);
      if (error) throw error;
      return data ? mapDbGeneticScreeningToApp(data) : null;
    },
    onSuccess: data => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.geneticScreenings() });
        queryClient.invalidateQueries({
          queryKey: healthQueryKeys.dogGeneticScreenings(data.dog_id),
        });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthStatistics(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthTimeline(data.dog_id) });
      }
    },
  });
};

export const useUpdateGeneticScreeningMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<GeneticScreeningRecord>;
    }) => {
      const dbUpdate = mapAppGeneticScreeningToDbUpdate(updates);
      const { data, error } = await updateGeneticScreening(id, dbUpdate);
      if (error) throw error;
      return data ? mapDbGeneticScreeningToApp(data) : null;
    },
    onSuccess: data => {
      if (data) {
        queryClient.invalidateQueries({
          queryKey: healthQueryKeys.dogGeneticScreenings(data.dog_id),
        });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthStatistics(data.dog_id) });
        queryClient.invalidateQueries({ queryKey: healthQueryKeys.healthTimeline(data.dog_id) });
      }
    },
  });
};

export const useDeleteGeneticScreeningMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await deleteGeneticScreening(id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: healthQueryKeys.all });
    },
  });
};
