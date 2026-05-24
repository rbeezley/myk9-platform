export type RingDisplayValue = number | string | null | undefined;

const MISSING_RING_LABELS = new Set(['0', 'null', 'unknown', 'ring 0', 'ring null', 'ring unknown']);

export function formatRingLabel(value: RingDisplayValue): string | null {
  if (value == null) return null;

  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? `Ring ${value}` : null;
  }

  const label = value.trim().replace(/\s+/g, ' ');
  if (!label) return null;

  const normalized = label.toLowerCase();
  if (MISSING_RING_LABELS.has(normalized)) return null;

  if (/^\d+$/.test(label)) {
    const ringNumber = Number(label);
    return ringNumber > 0 ? `Ring ${ringNumber}` : null;
  }

  return label;
}
