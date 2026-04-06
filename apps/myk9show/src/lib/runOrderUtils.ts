export type RunOrderPreset = 'armband-asc' | 'armband-desc' | 'random' | 'manual';

export interface RunOrderEntry {
  id: string;
  armband: string | null;
}

export interface RunOrderResult {
  id: string;
  runOrder: number;
}

function parseArmband(armband: string | null): number {
  const n = parseInt(armband ?? '0', 10);
  return isNaN(n) ? 0 : n;
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function calculateRunOrder(
  entries: RunOrderEntry[],
  preset: RunOrderPreset
): RunOrderResult[] {
  if (preset === 'manual') return [];

  let sorted: RunOrderEntry[];

  if (preset === 'armband-asc') {
    sorted = [...entries].sort((a, b) => parseArmband(a.armband) - parseArmband(b.armband));
  } else if (preset === 'armband-desc') {
    sorted = [...entries].sort((a, b) => parseArmband(b.armband) - parseArmband(a.armband));
  } else {
    // random
    sorted = shuffleArray([...entries]);
  }

  return sorted.map((entry, index) => ({ id: entry.id, runOrder: index + 1 }));
}
