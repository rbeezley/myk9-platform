import { getDogRegisteredName } from '@/types/dog-types';

/** One dog on a styled wizard receipt, with the classes it was entered in. */
export interface ReceiptDog {
  id: string;
  registeredName: string;
  callName: string | null;
  /** The dog's class names, comma-separated, e.g. "Container Novice A, Interior Novice A". */
  classSummary: string;
}

type ReceiptDogSource = Parameters<typeof getDogRegisteredName>[0] & {
  id: string;
  callName?: string | null | undefined;
};

interface ReceiptClassSelection {
  dogId: string;
  selectedClasses: readonly { classId: string }[];
}

/**
 * Every dog in the entry, in selection order, each with its own classes (MYK9-2474).
 * A receipt that showed only the first dog contradicted its own total and downloads.
 */
export function buildReceiptDogs(
  selections: readonly ReceiptClassSelection[],
  dogs: readonly ReceiptDogSource[],
  classes: readonly { id: string; className?: string | null | undefined }[]
): ReceiptDog[] {
  return selections.map(selection => {
    const dog = dogs.find(d => d.id === selection.dogId);
    return {
      id: selection.dogId,
      registeredName: dog ? (getDogRegisteredName(dog) ?? '') : '',
      callName: dog?.callName ?? null,
      classSummary: selection.selectedClasses
        .map(sc => classes.find(c => c.id === sc.classId)?.className ?? sc.classId)
        .join(', '),
    };
  });
}
