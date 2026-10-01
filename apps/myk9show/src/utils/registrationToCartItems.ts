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
  showFeeInfo: ShowFeeInfo,
  // MYK9-879: dogs whose handler the exhibitor declared a junior (self-declared;
  // never derived from a date of birth or from who owns the dog).
  juniorHandlerDogIds: ReadonlySet<string> = new Set()
): NewCartItem[] {
  const items: NewCartItem[] = [];
  const classesMap = new Map(classes.map(c => [c.id, c]));

  for (const selection of classSelections) {
    for (const selectedClass of selection.selectedClasses) {
      const handlerKey = makeHandlerKey(selection.dogId, selectedClass.classId);
      const handler = handlerAssignments[handlerKey];
      const classData = classesMap.get(selectedClass.classId);
      const juniorFeeDeclared = juniorHandlerDogIds.has(selection.dogId);
      const fee = getShowEntryFee(showFeeInfo, classData?.entryFee, undefined, juniorFeeDeclared);

      items.push({
        dogId: selection.dogId,
        classId: selectedClass.classId,
        handlerId: handler?.handlerId,
        jumpHeight: selectedClass.jumpHeight,
        entryFeeCents: Math.round(fee * 100),
        ...(juniorFeeDeclared ? { juniorFeeDeclared: true } : {}),
      });
    }
  }

  return items;
}
