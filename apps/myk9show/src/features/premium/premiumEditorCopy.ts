import type { GeneratedPremium, PremiumStyle } from '@/types/premium-types';

export interface PremiumEditorCopy {
  style: PremiumStyle | string;
  supplemental: GeneratedPremium['supplemental'];
  narratives: GeneratedPremium['narratives'];
}

/**
 * MYK9-2244: the one baseline for preview, Download PDF and Save & Publish. The server's facts
 * (address, trial limits, per-trial judges, event numbers, officials, fees) stay exactly as
 * returned; the editor overlays ONLY what it owns: its narratives, supplemental fields and style.
 */
export function applyEditorCopyToPremium(
  facts: GeneratedPremium,
  copy: PremiumEditorCopy
): GeneratedPremium {
  return {
    ...facts,
    style: copy.style as GeneratedPremium['style'],
    supplemental: copy.supplemental,
    narratives: copy.narratives,
  };
}
