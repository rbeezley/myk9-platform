import { getDogDisplayName, type Dog } from '@/types/dog-types';

/**
 * The Dogs list's CSV columns, shared by the whole-list "Export CSV" page action and the bulk
 * bar's selection export (MYK9-929). Owner is left out when every dog is the viewer's own.
 */
export function dogExportHeaders(includeOwner: boolean): string[] {
  return ['Name', 'Breed', 'Sex', ...(includeOwner ? ['Owner'] : []), 'Status'];
}

export function dogExportRows(dogs: readonly Dog[], includeOwner: boolean): string[][] {
  return dogs.map(dog => [
    getDogDisplayName(dog),
    dog.breed ?? '',
    dog.sex ?? '',
    ...(includeOwner ? [dog.ownerName ?? ''] : []),
    dog.status ?? 'active',
  ]);
}
