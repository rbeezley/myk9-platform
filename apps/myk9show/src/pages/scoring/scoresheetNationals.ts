/**
 * MYK9-1885: a show's Nationals flag (not a second trial-type choice) decides
 * that its AKC Scent Work trials score on the Nationals sheet. Trials already
 * typed "Scent Work Nationals" resolve to it directly; other registries and
 * sports are untouched.
 */
import { deriveRegistryId } from '@/features/registries';
import { isAkcNationalsEnabled, showIsNationals } from '@/features/registries/akcNationals';

const AKC_SCENT_WORK = 'akc-scent-work';
const AKC_SCENT_WORK_NATIONALS = 'akc-scent-work-nationals';

export function applyShowNationals(
  sportTypeCode: string | null,
  show: { organization?: string | null | undefined; isNationals?: boolean | null | undefined }
): string | null {
  if (sportTypeCode !== AKC_SCENT_WORK || !showIsNationals(show)) return sportTypeCode;
  return deriveRegistryId(show.organization) === 'AKC' ? AKC_SCENT_WORK_NATIONALS : sportTypeCode;
}

/**
 * The scoresheet for a trial or class that resolved to Nationals by its own
 * type or name ("Scent Work Nationals"). While Nationals is hidden (MYK9-2488)
 * it scores on the regular AKC Scent Work sheet.
 */
export function nationalsScoresheetKey(): 'AKC_SCENT_WORK_NATIONAL' | 'AKC_SCENT_WORK' {
  return isAkcNationalsEnabled() ? 'AKC_SCENT_WORK_NATIONAL' : 'AKC_SCENT_WORK';
}
