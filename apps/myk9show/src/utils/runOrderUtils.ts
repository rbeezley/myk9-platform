import type { ShowEntry } from '@/store/entry-store-types';

/**
 * Returns unscored entries sorted by armband number ascending.
 * This is the run order — dogs run in armband order.
 * Entries without armbands sort to the front (armband 0).
 */
function parseArmband(armband: string | undefined): number {
  if (!armband) return 0;
  const num = parseInt(armband, 10);
  return Number.isNaN(num) ? 0 : num;
}

export function getRunOrder(entries: ShowEntry[]): ShowEntry[] {
  return entries
    .filter(e => !e.competitionData)
    .sort((a, b) => {
      const aNum = parseArmband(a.registrationData?.armband);
      const bNum = parseArmband(b.registrationData?.armband);
      return aNum - bNum;
    });
}
