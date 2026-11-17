/**
 * MYK9-2139: when the AI narrative call fails, the premium falls back to the narratives already
 * published for the show (`shows.experience_published_content.narratives`), never to invented
 * placeholder text. The column is jsonb, so everything here is checked defensively.
 */

export interface PremiumNarratives {
  showHours: string;
  trialInformation: string;
}

// Placeholder text older versions of this function wrote on failure. Never carry it forward.
const LEGACY_PLACEHOLDERS = new Set([
  'show hours to be announced.',
  'trial information to be announced.',
]);

function cleanNarrative(value: unknown): string {
  if (typeof value !== 'string') return '';
  return LEGACY_PLACEHOLDERS.has(value.trim().toLowerCase()) ? '' : value;
}

export function publishedNarratives(content: unknown): PremiumNarratives {
  const narratives =
    content && typeof content === 'object' && !Array.isArray(content)
      ? (content as Record<string, unknown>).narratives
      : null;
  if (!narratives || typeof narratives !== 'object' || Array.isArray(narratives)) {
    return { showHours: '', trialInformation: '' };
  }
  const row = narratives as Record<string, unknown>;
  return {
    showHours: cleanNarrative(row.showHours),
    trialInformation: cleanNarrative(row.trialInformation),
  };
}

/**
 * A model answer with a blank section is incomplete: each blank section falls back to the
 * published text, so a partial answer never erases what exhibitors can already read.
 */
export function completeNarratives(
  generated: PremiumNarratives,
  published: PremiumNarratives
): { narratives: PremiumNarratives; incomplete: boolean } {
  const showHours = generated.showHours.trim() ? generated.showHours : published.showHours;
  const trialInformation = generated.trialInformation.trim()
    ? generated.trialInformation
    : published.trialInformation;
  const incomplete = !generated.showHours.trim() || !generated.trialInformation.trim();
  return { narratives: { showHours, trialInformation }, incomplete };
}
