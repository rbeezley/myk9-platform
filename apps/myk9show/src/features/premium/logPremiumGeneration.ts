import type {
  GeneratedPremium,
  PremiumFieldOverride,
  PremiumNarrativeEdit,
} from '../../types/premium-types';

export interface PremiumDownloadDiff {
  fieldOverrides: Record<string, PremiumFieldOverride>;
  narrativeEdits: Record<string, PremiumNarrativeEdit>;
}

// Order-stable JSON serializer. Postgres JSONB does not preserve key order on
// round-trip, so naive JSON.stringify can flag false-positive overrides when
// the only difference is key ordering. Sorting keys first guarantees that
// equivalent objects stringify to equal strings regardless of source order.
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys
    .map(k => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
    .join(',')}}`;
}

// Computes the diff between original generated values and final downloaded values
export function computePremiumDiff(
  original: GeneratedPremium,
  finalSupplemental: GeneratedPremium['supplemental'],
  finalNarratives: { showHours: string; trialInformation: string },
  finalStyle: string
): PremiumDownloadDiff {
  const fieldOverrides: Record<string, PremiumFieldOverride> = {};
  const narrativeEdits: Record<string, PremiumNarrativeEdit> = {};

  // Check supplemental field overrides
  if (
    stableStringify(finalSupplemental.vetClinic) !==
    stableStringify(original.supplemental.vetClinic)
  ) {
    fieldOverrides['vet_clinic'] = {
      templateValue: original.supplemental.vetClinic,
      finalValue: finalSupplemental.vetClinic,
    };
  }
  if (
    stableStringify(finalSupplemental.accommodations) !==
    stableStringify(original.supplemental.accommodations)
  ) {
    fieldOverrides['accommodations'] = {
      templateValue: original.supplemental.accommodations,
      finalValue: finalSupplemental.accommodations,
    };
  }
  if (finalSupplemental.hospitalityNotes !== original.supplemental.hospitalityNotes) {
    fieldOverrides['hospitality_notes'] = {
      templateValue: original.supplemental.hospitalityNotes,
      finalValue: finalSupplemental.hospitalityNotes,
    };
  }
  if (finalSupplemental.awardsDescription !== original.supplemental.awardsDescription) {
    fieldOverrides['awards_description'] = {
      templateValue: original.supplemental.awardsDescription,
      finalValue: finalSupplemental.awardsDescription,
    };
  }
  if (finalSupplemental.additionalNotes !== original.supplemental.additionalNotes) {
    fieldOverrides['additional_notes'] = {
      templateValue: original.supplemental.additionalNotes,
      finalValue: finalSupplemental.additionalNotes,
    };
  }
  if (finalStyle !== original.style) {
    fieldOverrides['style'] = {
      templateValue: original.style,
      finalValue: finalStyle,
    };
  }

  // Check narrative edits
  if (finalNarratives.showHours !== original.narratives.showHours) {
    narrativeEdits['showHours'] = {
      generatedValue: original.narratives.showHours,
      finalValue: finalNarratives.showHours,
    };
  }
  if (finalNarratives.trialInformation !== original.narratives.trialInformation) {
    narrativeEdits['trialInformation'] = {
      generatedValue: original.narratives.trialInformation,
      finalValue: finalNarratives.trialInformation,
    };
  }

  return { fieldOverrides, narrativeEdits };
}
