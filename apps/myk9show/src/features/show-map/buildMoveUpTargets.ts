/**
 * Change-class target builder for the Overview and Show Desk dialog. The rule
 * itself (every not-complete class in every trial that the dog is not already
 * entered in) lives in `@/utils/changeClassTargets`; this adds the Show Map
 * labels and trial detail (MYK9-1265).
 */
import { formatTrialLabel } from '@myk9/core';
import {
  buildClassDisambiguatorsByGroup,
  buildFullClassLabel,
} from '@/features/_shared/classLabel';
import { entryHoldsDogInClass, selectChangeClassTargets } from '@/utils/changeClassTargets';
import type { ShowMapMoveUpTarget } from './ShowMapMoveUpDialog';
import type { BuildShowMapTreeInput, ShowMapEntryInput } from './showMapTypes';

function readId(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value) return value;
  }
  return undefined;
}

/** Classes this dog already holds a live entry in (never a valid target). */
export function classIdsEnteredByDog(
  entries: readonly ShowMapEntryInput[],
  dogId: string | undefined
): ReadonlySet<string> {
  const ids = new Set<string>();
  if (!dogId) return ids;
  for (const entry of entries) {
    const dog = entry.dog;
    const entryDogId =
      (dog && typeof dog === 'object' ? readId(dog as Record<string, unknown>, 'id') : undefined) ??
      readId(entry, 'dog_id', 'dogId');
    const classId = readId(entry, 'class_id', 'classId');
    if (entryDogId === dogId && classId && entryHoldsDogInClass(entry)) ids.add(classId);
  }
  return ids;
}

/**
 * When `availableSpotsByClassId` is supplied, a class with no free seat stays
 * listed, flagged `isFull`. Capacity is advisory: the write path refuses a full
 * class either way.
 */
export function buildMoveUpTargets(
  classes: BuildShowMapTreeInput['classes'],
  currentClassId: string | undefined,
  enteredClassIds: ReadonlySet<string> = new Set(),
  availableSpotsByClassId?: ReadonlyMap<string, number>
): ShowMapMoveUpTarget[] {
  const targets = selectChangeClassTargets(classes, currentClassId, enteredClassIds, cls =>
    availableSpotsByClassId?.get(cls.id)
  );
  // A collision is a question about classes in the SAME trial (MYK9-805).
  const disambiguatorFor = buildClassDisambiguatorsByGroup(classes, cls => cls.trialId);

  const orderKey = (cls: (typeof targets)[number]['cls']) =>
    `${cls.trialDate ?? ''}|${cls.trialNumber ?? ''}|${cls.trialId}`;

  return targets
    .map(({ cls, isFull }) => {
      const identity = {
        name: cls.name,
        element: cls.element,
        level: cls.level,
        section: cls.section,
      };
      return {
        key: orderKey(cls),
        target: {
          id: cls.id,
          isFull,
          label: buildFullClassLabel(identity, disambiguatorFor(cls.trialId)(identity), cls.name),
          detail: [
            cls.trialDate,
            cls.trialName || cls.trialNumber
              ? formatTrialLabel({ name: cls.trialName, trialNumber: cls.trialNumber })
              : undefined,
          ]
            .filter(Boolean)
            .join(' · '),
        },
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key) || a.target.label.localeCompare(b.target.label))
    .map(item => item.target);
}
