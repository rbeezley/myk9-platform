/**
 * Types and constants for HealthRecordsSection
 */

import type { UseMutationResult } from '@tanstack/react-query';
import type { HealthItemType } from './AddHealthItemDialog';
import type { OFAScreeningRecord, GeneticScreeningRecord } from '../../../../types/health';

export interface HealthRecordsSectionProps {
  user: { isPremium: boolean };
  dogId?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mutation results have varying TData/TVariables; dispatch function handles casting
type AnyMutation = UseMutationResult<any, Error, any>;

export interface HealthMutations {
  createVaccination: AnyMutation;
  createMedication: AnyMutation;
  createAllergy: AnyMutation;
  createVetVisit: AnyMutation;
  createOFAScreening: AnyMutation;
  createGeneticScreening: AnyMutation;
}

/** Dispatch a health item add to the appropriate mutation */
export function dispatchHealthItem(
  type: HealthItemType,
  data: Record<string, unknown>,
  mutations: HealthMutations,
  ownerId: string | undefined
): void {
  switch (type) {
    case 'vaccination':
      mutations.createVaccination.mutate({
        dog_id: data.dog_id as string,
        vaccine_name: data.vaccine_name as string,
        date_given: data.date_given as string,
        expiration_date: (data.expiration_date as string) || undefined,
        vet_name: (data.vet_name as string) || undefined,
        lot_number: (data.lot_number as string) || undefined,
        notes: (data.notes as string) || undefined,
      });
      break;
    case 'medication':
      mutations.createMedication.mutate({
        dog_id: data.dog_id as string,
        medication_name: data.medication_name as string,
        dosage: (data.dosage as string) || undefined,
        frequency: (data.frequency as string) || undefined,
        start_date: (data.start_date as string) || undefined,
        end_date: (data.end_date as string) || undefined,
        is_active: true,
        notes: (data.notes as string) || undefined,
      });
      break;
    case 'allergy':
      mutations.createAllergy.mutate({
        dog_id: data.dog_id as string,
        allergen: data.allergen as string,
        reaction: (data.reaction as string) || undefined,
        severity:
          (data.severity as 'mild' | 'moderate' | 'severe' | 'life_threatening') || undefined,
        discovered_date: (data.discovered_date as string) || undefined,
        notes: (data.notes as string) || undefined,
      });
      break;
    case 'vet_visit':
      mutations.createVetVisit.mutate({
        dog_id: data.dog_id as string,
        visit_date: data.visit_date as string,
        reason: data.reason as string,
        diagnosis: (data.diagnosis as string) || undefined,
        treatment: (data.treatment as string) || undefined,
        vet_name: (data.vet_name as string) || undefined,
        cost: data.cost as number | undefined,
        notes: (data.notes as string) || undefined,
      });
      break;
    case 'ofa_screening':
      if (!ownerId) break;
      mutations.createOFAScreening.mutate({
        dog_id: data.dog_id as string,
        owner_id: ownerId,
        test_type: data.test_type as OFAScreeningRecord['test_type'],
        test_date: data.test_date as string,
        result: (data.result as string) || undefined,
        certification_number: (data.certification_number as string) || undefined,
        status: data.status as OFAScreeningRecord['status'],
        veterinarian: (data.veterinarian as string) || undefined,
        notes: (data.notes as string) || undefined,
      });
      break;
    case 'genetic_screening':
      if (!ownerId) break;
      mutations.createGeneticScreening.mutate({
        dog_id: data.dog_id as string,
        owner_id: ownerId,
        provider: data.provider as string,
        test_date: data.test_date as string,
        results: data.results as GeneticScreeningRecord['results'],
        notes: (data.notes as string) || undefined,
      });
      break;
  }
}

/** Status badge colors for OFA screenings */
export const ofaStatusColors: Record<string, string> = {
  normal: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  carrier: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  affected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  pending: 'bg-muted text-muted-foreground',
};

/** Status badge colors for genetic marker statuses */
export const geneticStatusColors: Record<string, string> = {
  clear: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  carrier: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  affected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  at_risk: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
};
