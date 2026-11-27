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
 * Every dog in the entry, each with its own classes (MYK9-2474). A receipt that showed only
 * the first dog contradicted its own total and downloads.
 *
 * Dogs follow `pickedDogIds`, the order the dogs were picked: editing a dog's classes moves
 * its selection row to the end, so the selections' own order is the last edit's. A dog not
 * in `pickedDogIds` keeps its selection order after the picked ones.
 */
export function buildReceiptDogs(
  selections: readonly ReceiptClassSelection[],
  dogs: readonly ReceiptDogSource[],
  classes: readonly { id: string; className?: string | null | undefined }[],
  pickedDogIds: readonly string[] = []
): ReceiptDog[] {
  const rank = (dogId: string) => {
    const index = pickedDogIds.indexOf(dogId);
    return index === -1 ? pickedDogIds.length : index;
  };
  const ordered = [...selections].sort((a, b) => rank(a.dogId) - rank(b.dogId));
  return ordered.map(selection => {
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
