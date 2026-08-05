import type { ClassSelectionData } from '@/types/show-registration-types';
import type { ClassAvailability } from '@/hooks/useClassAvailability';

export interface RegistrationCapacityState {
  waitlistClassIds: Set<string>;
  blockedClassIds: Set<string>;
  unknownClassIds: Set<string>;
}

/**
 * Map the selected class lines to the same open/full/wait-list states shown in
 * class selection. Unknown selected classes are treated as unresolved so the
 * payment step cannot present a guessed amount as final.
 */
export function getRegistrationCapacityState(
  classSelections: ClassSelectionData[],
  availability: ClassAvailability[],
  selectedDogIds: ReadonlySet<string>
): RegistrationCapacityState {
  const selectedClassIds = new Set(
    classSelections
      .filter(selection => selectedDogIds.has(selection.dogId))
      .flatMap(selection => selection.selectedClasses.map(cls => cls.classId))
  );
  const waitlistClassIds = new Set<string>();
  const blockedClassIds = new Set<string>();
  const knownClassIds = new Set(availability.map(cls => cls.classId));

  for (const cls of availability) {
    if (!selectedClassIds.has(cls.classId) || !cls.isFull) continue;
    if (cls.allowsWaitlist) {
      waitlistClassIds.add(cls.classId);
    } else {
      blockedClassIds.add(cls.classId);
    }
  }

  const unknownClassIds = new Set(
    [...selectedClassIds].filter(classId => !knownClassIds.has(classId))
  );

  return { waitlistClassIds, blockedClassIds, unknownClassIds };
}
