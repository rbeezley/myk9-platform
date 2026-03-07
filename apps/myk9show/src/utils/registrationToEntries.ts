/**
 * Converts registration wizard data into ShowEntryInput[] for the entry store.
 *
 * The registration wizard collects ClassSelectionData (dogId + trialId + classIds)
 * and HandlerInfo assignments. This function flattens that into one ShowEntryInput
 * per dog+class combination, ready for useEntryStore.createMultipleEntries().
 */

import type { ClassSelectionData, HandlerInfo } from '@/types/show-registration-types';
import { makeHandlerKey } from '@/types/show-registration-types';
import type { ShowEntryInput } from '@/store/entry-store-types';
import {
  getShowEntryFee,
  type ShowFeeInfo,
} from '@/components/shows/RegistrationWorkflow/PaymentStep/utils';

interface ClassLike {
  id: string;
  entryFee?: number | undefined;
}

export function registrationToEntries(
  showId: string,
  classSelections: ClassSelectionData[],
  handlerAssignments: Record<string, HandlerInfo>,
  classes: ClassLike[],
  show?: ShowFeeInfo
): ShowEntryInput[] {
  const entries: ShowEntryInput[] = [];

  for (const selection of classSelections) {
    for (const cls of selection.selectedClasses) {
      const handlerKey = makeHandlerKey(selection.dogId, cls.classId);
      const handler = handlerAssignments[handlerKey];
      const classData = classes.find(c => c.id === cls.classId);
      const fee = getShowEntryFee(show, classData?.entryFee);

      entries.push({
        showId,
        classId: cls.classId,
        dogId: selection.dogId,
        registrationData: {
          submittedAt: new Date().toISOString(),
          handler: handler?.handlerName || '',
          handlerId: handler?.handlerId,
          entryFee: fee,
          paymentStatus: 'pending',
          jumpHeight: cls.jumpHeight,
          moveUpRequested: cls.moveUpRequested,
        },
      });
    }
  }

  return entries;
}
