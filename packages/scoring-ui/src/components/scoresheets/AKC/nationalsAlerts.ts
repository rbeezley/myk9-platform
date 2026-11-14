export function calculatePoints(correctAlerts: number[], incorrectAlerts: number[]): number {
  let pts = 0;
  for (let i = 0; i < correctAlerts.length; i++) {
    pts += (correctAlerts[i] ?? 0) * 10;
    pts -= (incorrectAlerts[i] ?? 0) * 5;
  }
  return Math.max(0, pts);
}

/** Saved totals go in Area 1 (only totals are stored); the rest start at zero. */
export function seedAlerts(areaCount: number, total = 0): number[] {
  return Array.from({ length: areaCount }, (_, i) => (i === 0 ? total : 0));
}

export const sum = (counts: number[]): number => counts.reduce((total, n) => total + n, 0);
