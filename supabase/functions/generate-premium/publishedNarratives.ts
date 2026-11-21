/**
 * The narratives already published for the show (`shows.experience_published_content.narratives`),
 * which a secretary may have edited (MYK9-2055 keeps them). The column is jsonb, so everything
 * here is checked defensively.
 *
 * MYK9-2216: they are reused only when the snapshot was built for the show's organization. A
 * snapshot for another organization, or one published before snapshots recorded it, carries
 * nothing over, so a Regenerate after an organization change writes fresh text.
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

export function publishedNarratives(
  content: unknown,
  organization: string | null
): PremiumNarratives {
  const record =
    content && typeof content === 'object' && !Array.isArray(content)
      ? (content as Record<string, unknown>)
      : null;
  const builtForShow = record !== null && organization !== null && record.org === organization;
  const narratives = builtForShow ? record.narratives : null;
  if (!narratives || typeof narratives !== 'object' || Array.isArray(narratives)) {
    return { showHours: '', trialInformation: '' };
  }
  const row = narratives as Record<string, unknown>;
  return {
    showHours: cleanNarrative(row.showHours),
    trialInformation: cleanNarrative(row.trialInformation),
  };
}
