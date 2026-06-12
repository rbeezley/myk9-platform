import type { ShowFeeInfo } from '@/components/shows/RegistrationWorkflow/PaymentStep/utils';
import { getShowEntryFee } from '@/components/shows/RegistrationWorkflow/PaymentStep/utils';
import type { NewCartItem } from '@/store/cartStore';
import type { ClassSelectionData, HandlerInfo } from '@/types/show-registration-types';
import { makeHandlerKey } from '@/types/show-registration-types';

interface ClassLike {
  id: string;
  entryFee?: number | undefined;
}

export function registrationToCartItems(
  classSelections: ClassSelectionData[],
  handlerAssignments: Record<string, HandlerInfo>,
  classes: ClassLike[],
  showFeeInfo: ShowFeeInfo
): NewCartItem[] {
  const items: NewCartItem[] = [];
  const classesMap = new Map(classes.map(c => [c.id, c]));

  for (const selection of classSelections) {
    for (const selectedClass of selection.selectedClasses) {
      const handlerKey = makeHandlerKey(selection.dogId, selectedClass.classId);
      const handler = handlerAssignments[handlerKey];
      const classData = classesMap.get(selectedClass.classId);
      const fee = getShowEntryFee(showFeeInfo, classData?.entryFee);

      items.push({
        dogId: selection.dogId,
        classId: selectedClass.classId,
        handlerId: handler?.handlerId,
        jumpHeight: selectedClass.jumpHeight,
        entryFeeCents: Math.round(fee * 100),
      });
    }
  }

  return items;
}
