/**
 * Class label and ordering for the Show Desk schedule/focused class — MYK9-825.
 *
 * A UKC show splits every level into A/B (10 classes per element per trial),
 * so the schedule needs the section on every row AND the registry's level
 * progression (Novice -> Elite), not the stored `display_order`/name alone.
 * Reuses the same registry-aware comparator the premium PDFs already use
 * (`compareClassesByProgression`) and the shared class-label composer
 * (`buildFullClassLabel`) rather than inventing a third rule.
 */
import {
  buildClassDisambiguatorsByGroup,
  buildFullClassLabel,
} from '@/features/_shared/classLabel';
import { compareClassesByProgression } from '@/features/premium/pdf/bodies/classOrder';
import type { RegistryId } from '@/features/registries';
import type { SecretaryCockpitClass } from './secretaryCockpitTypes';

/** Minute-of-day sort key, or `null` when the class has no scheduled time. */
export type ScheduledMinutesOf = (cls: SecretaryCockpitClass) => number | null;

/**
 * One label resolver over ALL of a snapshot's classes, so the disambiguator
 * for a trial stays correct regardless of which subset (a filtered view, a
 * single day) is currently being rendered.
 */
export function buildCockpitClassLabelResolver(
  classes: readonly SecretaryCockpitClass[]
): (cls: SecretaryCockpitClass) => string {
  const disambiguatorFor = buildClassDisambiguatorsByGroup(classes, cls => cls.trialId);

  return cls => {
    const identity = {
      name: cls.name,
      element: cls.element,
      level: cls.level,
      section: cls.section,
    };
    const extra = disambiguatorFor(cls.trialId)(identity);
    return buildFullClassLabel(identity, extra, cls.name);
  };
}

/**
 * Order classes by scheduled time first (a live reschedule is the most
 * current fact), then by the registry's element/level/section progression,
 * then by the stored display order and name as a last-resort tiebreak.
 *
 * Deliberately does NOT trust `classOrder`/`display_order` ahead of the
 * registry ladder: the Oct 10 UKC dress rehearsal's classes were inserted in
 * an order that had nothing to do with level progression, and every
 * class-list surface that sorted on it inherited the same scramble.
 */
export function compareCockpitClasses(
  a: SecretaryCockpitClass,
  b: SecretaryCockpitClass,
  scheduledMinutesOf: ScheduledMinutesOf,
  registryId: RegistryId
): number {
  const aTime = scheduledMinutesOf(a);
  const bTime = scheduledMinutesOf(b);
  if (aTime !== null && bTime !== null && aTime !== bTime) return aTime - bTime;
  if (aTime !== bTime) return (aTime ?? Infinity) - (bTime ?? Infinity);

  const progression = compareClassesByProgression(
    { element: a.element ?? '', level: a.level ?? '', section: a.section ?? null },
    { element: b.element ?? '', level: b.level ?? '', section: b.section ?? null },
    registryId
  );
  if (progression !== 0) return progression;

  return a.classOrder - b.classOrder || a.name.localeCompare(b.name);
}
