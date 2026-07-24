/**
 * Form-boundary validation for AddHealthItemDialog. Runs in addition to
 * native `required` attributes so an invalid submission never reaches the
 * create mutation (see openspec/changes/exhibitor-journey-completion,
 * design.md Decision 3).
 */
import type { HealthItemType } from './AddHealthItemDialog';

export interface GeneticMarkerRowFields {
  marker: string;
  result: string;
}

export interface AddHealthItemFields {
  vaccineName: string;
  dateGiven: string;
  medicationName: string;
  allergen: string;
  visitDate: string;
  reason: string;
  ofaTestDate: string;
  geneticProvider: string;
  geneticTestDate: string;
  geneticMarkers: GeneticMarkerRowFields[];
}

/** Returns a human-readable message identifying the missing required field(s), or null when valid. */
export function validateAddHealthItem(
  type: HealthItemType,
  fields: AddHealthItemFields
): string | null {
  switch (type) {
    case 'vaccination':
      if (!fields.vaccineName.trim()) return 'Vaccine Name is required.';
      if (!fields.dateGiven) return 'Date Given is required.';
      return null;
    case 'medication':
      if (!fields.medicationName.trim()) return 'Medication Name is required.';
      return null;
    case 'allergy':
      if (!fields.allergen.trim()) return 'Allergen is required.';
      return null;
    case 'vet_visit':
      if (!fields.visitDate) return 'Visit Date is required.';
      if (!fields.reason.trim()) return 'Reason is required.';
      return null;
    case 'ofa_screening':
      if (!fields.ofaTestDate) return 'Test Date is required.';
      return null;
    case 'genetic_screening':
      if (!fields.geneticProvider.trim()) return 'Provider is required.';
      if (!fields.geneticTestDate) return 'Test Date is required.';
      // A row with only a marker or only a result is neither a complete
      // entry nor cleanly droppable: the submit code filters rows by
      // marker presence alone, so a result-only row is silently discarded
      // and a marker-only row persists with no result. Reject any
      // half-filled row instead of guessing which half was meant.
      if (
        fields.geneticMarkers.some(row => (row.marker.trim() !== '') !== (row.result.trim() !== ''))
      ) {
        return 'Each marker row needs both a marker and a result, or leave the row empty.';
      }
      return null;
    default:
      return null;
  }
}
