/**
 * MYK9-1885: a show's Nationals flag (not a second trial-type choice) decides
 * that its AKC Scent Work trials score on the Nationals sheet. Trials already
 * typed "Scent Work Nationals" resolve to it directly; other registries and
 * sports are untouched.
 */
import { deriveRegistryId } from '@/features/registries';

const AKC_SCENT_WORK = 'akc-scent-work';
const AKC_SCENT_WORK_NATIONALS = 'akc-scent-work-nationals';

export function applyShowNationals(
  sportTypeCode: string | null,
  show: { organization?: string | null | undefined; isNationals?: boolean | null | undefined }
): string | null {
  if (sportTypeCode !== AKC_SCENT_WORK || !show.isNationals) return sportTypeCode;
  return deriveRegistryId(show.organization) === 'AKC' ? AKC_SCENT_WORK_NATIONALS : sportTypeCode;
}
