/**
 * Shared move-up target builder for the Show Map and Show Desk surfaces.
 *
 * Both surfaces previously built targets as "every class except the current
 * one", which offered the same semantically invalid options (lower levels,
 * cross-element) that Entries Management was fixed to exclude. This builder
 * applies the canonical same-element + strictly-higher-level rule from
 * `@/utils/moveUpEligibility` so all three surfaces agree.
 */
import { formatTrialLabel } from '@myk9/core';
import { buildClassDisambiguator, buildFullClassLabel } from '@/features/_shared/classLabel';
import { isEligibleMoveUpTarget } from '@/utils/moveUpEligibility';
import type { ShowMapMoveUpTarget } from './ShowMapMoveUpDialog';
import type { BuildShowMapTreeInput } from './showMapTypes';
import type { RegistryId } from '@/features/registries';

/**
 * `registryId` defaults to AKC for any caller not yet updated — pass the show's
 * actual registry (a show's trials always share one — see scoping §7) so
 * UKC/ASCA-only levels (Superior/Elite, Open) are recognized. See
 * isEligibleMoveUpTarget's NOT COVERED note re: ASCA's standalone Champion class.
 *
 * Restricted to the entry's OWN trial (MYK9-825): a UKC show's two same-day
 * trials both offer the same element/level ladder, so without this a class in
 * trial 2 read as a valid, indistinguishable-looking move-up target for an
 * entry in trial 1, and confirming it silently moved the entry across trials.
 */
export function buildMoveUpTargets(
  classes: BuildShowMapTreeInput['classes'],
  currentClassId: string | undefined,
  registryId: RegistryId = 'AKC'
): ShowMapMoveUpTarget[] {
  const current = currentClassId ? classes.find(cls => cls.id === currentClassId) : undefined;
  if (!current) return [];

  const sameTrial = classes.filter(cls => cls.trialId === current.trialId);
  // Scoped to the entry's own trial: a same-shaped class in another trial is
  // never a collision to disambiguate, it's excluded entirely by the filter above.
  const disambiguate = buildClassDisambiguator(
    sameTrial.map(cls => ({ name: cls.name, element: cls.element, level: cls.level, section: cls.section }))
  );

  return sameTrial
    .filter(cls => cls.id !== currentClassId && isEligibleMoveUpTarget(current, cls, registryId))
    .map(cls => {
      const identity = { name: cls.name, element: cls.element, level: cls.level, section: cls.section };
      return {
        id: cls.id,
        label: buildFullClassLabel(identity, disambiguate(identity), cls.name),
        detail: [
          cls.trialDate,
          cls.trialName || cls.trialNumber
            ? formatTrialLabel({ name: cls.trialName, trialNumber: cls.trialNumber })
            : undefined,
        ]
          .filter(Boolean)
          .join(' · '),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}
