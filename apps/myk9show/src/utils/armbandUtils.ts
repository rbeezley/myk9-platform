export const UNASSIGNED_ARMBAND_DISPLAY = '—';

export type ArmbandDisplayValue = string | number | null | undefined;

export function formatArmbandDisplay(armband: ArmbandDisplayValue): string {
  if (armband == null) return UNASSIGNED_ARMBAND_DISPLAY;

  if (typeof armband === 'number') {
    return armband === 0 || Number.isNaN(armband) ? UNASSIGNED_ARMBAND_DISPLAY : String(armband);
  }

  const trimmed = armband.trim();
  if (!trimmed || /^-+$/.test(trimmed)) return UNASSIGNED_ARMBAND_DISPLAY;
  if (/^\d+$/.test(trimmed) && Number(trimmed) === 0) return UNASSIGNED_ARMBAND_DISPLAY;

  return trimmed;
}

export function resolveStartNumber(
  existingMaxArmband: string | null | undefined,
  startNumber: number
): number {
  if (!existingMaxArmband) return startNumber;
  const parsed = parseInt(existingMaxArmband, 10);
  if (isNaN(parsed)) return startNumber;
  return Math.max(startNumber, parsed + 1);
}
