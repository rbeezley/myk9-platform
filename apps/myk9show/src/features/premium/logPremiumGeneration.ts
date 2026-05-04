import type {
  GeneratedPremium,
  PremiumFieldOverride,
  PremiumNarrativeEdit,
} from '../../types/premium-types';

export interface PremiumDownloadDiff {
  fieldOverrides: Record<string, PremiumFieldOverride>;
  narrativeEdits: Record<string, PremiumNarrativeEdit>;
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
    JSON.stringify(finalSupplemental.vetClinic) !== JSON.stringify(original.supplemental.vetClinic)
  ) {
    fieldOverrides['vet_clinic'] = {
      templateValue: original.supplemental.vetClinic,
      finalValue: finalSupplemental.vetClinic,
    };
  }
  if (
    JSON.stringify(finalSupplemental.accommodations) !==
    JSON.stringify(original.supplemental.accommodations)
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
