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
import { selectMoveUpTargetClasses } from '@/utils/moveUpTargetSelection';
import type { ShowMapMoveUpTarget } from './ShowMapMoveUpDialog';
import type { BuildShowMapTreeInput } from './showMapTypes';
import type { RegistryId } from '@/features/registries';

/**
 * `registryId` defaults to AKC for any caller not yet updated — pass the show's
 * actual registry (a show's trials always share one — see scoping §7) so
 * UKC/ASCA-only levels (Superior/Elite, Open) are recognized. See
 * isEligibleMoveUpTarget's NOT COVERED note re: ASCA's standalone Champion class.
 *
 * Restricted to the entry's OWN trial (MYK9-825, now enforced inside
 * isEligibleMoveUpTarget itself, MYK9-920) and, when `availableSpotsByClassId`
 * is supplied, to classes with a free seat. Capacity is advisory: a class with
 * no entry in the map is offered, and the write path refuses a full class.
 */
export function buildMoveUpTargets(
  classes: BuildShowMapTreeInput['classes'],
  currentClassId: string | undefined,
  registryId: RegistryId = 'AKC',
  availableSpotsByClassId?: ReadonlyMap<string, number>
): ShowMapMoveUpTarget[] {
  // Same trial, same element, higher level AND capacity: the one shared rule
  // (MYK9-920), identical to the Entries Management approve dialog.
  const targets = selectMoveUpTargetClasses(classes, currentClassId, registryId, cls =>
    availableSpotsByClassId?.get(cls.id)
  );
  const current = currentClassId ? classes.find(cls => cls.id === currentClassId) : undefined;
  if (!current) return [];

  const sameTrial = classes.filter(cls => cls.trialId === current.trialId);
  // Scoped to the entry's own trial: a same-shaped class in another trial is
  // never a collision to disambiguate, it's excluded entirely by the filter above.
  const disambiguate = buildClassDisambiguator(
    sameTrial.map(cls => ({
      name: cls.name,
      element: cls.element,
      level: cls.level,
      section: cls.section,
    }))
  );

  return targets
    .map(cls => {
      const identity = {
        name: cls.name,
        element: cls.element,
        level: cls.level,
        section: cls.section,
      };
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
