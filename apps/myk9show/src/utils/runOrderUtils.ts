import type { ShowEntry } from '@/store/entry-store-types';

/**
 * Returns unscored entries sorted by armband number ascending.
 * This is the run order — dogs run in armband order.
 * Entries without armbands sort to the front (armband 0).
 */
export function getRunOrder(entries: ShowEntry[]): ShowEntry[] {
  return entries
    .filter(e => !e.competitionData)
    .sort((a, b) => {
      const aNum = parseInt(a.registrationData?.armband ?? '0', 10);
      const bNum = parseInt(b.registrationData?.armband ?? '0', 10);
      return aNum - bNum;
    });
}
