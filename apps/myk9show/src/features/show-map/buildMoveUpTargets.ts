/**
 * Shared move-up target builder for the Show Map and Show Desk surfaces.
 *
 * Both surfaces previously built targets as "every class except the current
 * one", which offered the same semantically invalid options (lower levels,
 * cross-element) that Entries Management was fixed to exclude. This builder
 * applies the canonical same-element + strictly-higher-level rule from
 * `@/utils/moveUpEligibility` so all three surfaces agree.
 */
import { isEligibleMoveUpTarget } from '@/utils/moveUpEligibility';
import type { ShowMapMoveUpTarget } from './ShowMapMoveUpDialog';
import type { BuildShowMapTreeInput } from './showMapTypes';
import type { RegistryId } from '@/features/registries';

/**
 * `registryId` defaults to AKC for any caller not yet updated — pass the show's
 * actual registry (a show's trials always share one — see scoping §7) so
 * UKC/ASCA-only levels (Superior/Elite, Open) are recognized. See
 * isEligibleMoveUpTarget's NOT COVERED note re: ASCA's standalone Champion class.
 */
export function buildMoveUpTargets(
  classes: BuildShowMapTreeInput['classes'],
  currentClassId: string | undefined,
  registryId: RegistryId = 'AKC'
): ShowMapMoveUpTarget[] {
  const current = currentClassId ? classes.find(cls => cls.id === currentClassId) : undefined;
  if (!current) return [];

  return classes
    .filter(cls => cls.id !== currentClassId && isEligibleMoveUpTarget(current, cls, registryId))
    .map(cls => ({
      id: cls.id,
      label: cls.name || [cls.element, cls.level, cls.section].filter(Boolean).join(' '),
      detail: [cls.trialDate, cls.trialNumber ? `Trial ${cls.trialNumber}` : undefined]
        .filter(Boolean)
        .join(' · '),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
