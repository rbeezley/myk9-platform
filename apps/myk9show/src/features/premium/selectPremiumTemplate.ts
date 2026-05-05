import type { ClubPremiumTemplate } from '../../types/premium-types';

export function selectPremiumTemplate(
  templates: ClubPremiumTemplate[],
  trialType: string | null
): ClubPremiumTemplate | null {
  if (templates.length === 0) return null;
  if (trialType) {
    const match = templates.find(t => t.trialType === trialType);
    if (match) return match;
  }
  return templates.find(t => t.isDefault) ?? null;
}
