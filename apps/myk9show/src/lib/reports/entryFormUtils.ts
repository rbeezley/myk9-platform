import type { EntryFormTrial, EntryFormEntry, EntryFormDog, GridCell } from './entryFormTypes';
import { AKC_SCENT_WORK_ELEMENTS } from './entryFormTypes';

/**
 * Build a class selection grid: Map<trialId, Map<element, GridCell>>
 * Each cell tracks which levels are checked and Novice A/B designation.
 */
export function buildClassGrid(
  entries: EntryFormEntry[],
  trials: EntryFormTrial[]
): Map<string, Map<string, GridCell>> {
  const grid = new Map<string, Map<string, GridCell>>();

  for (const trial of trials) {
    const elementMap = new Map<string, GridCell>();
    for (const element of AKC_SCENT_WORK_ELEMENTS) {
      elementMap.set(element, { checkedLevels: new Set(), noviceClass: null });
    }
    grid.set(trial.id, elementMap);
  }

  for (const entry of entries) {
    const elementMap = grid.get(entry.trialId);
    if (!elementMap) continue;

    const element = matchElement(entry.element);
    if (!element) continue;

    const cell = elementMap.get(element);
    if (!cell) continue;

    const { level, noviceClass } = parseLevel(entry.level);
    cell.checkedLevels.add(level);
    if (noviceClass) {
      cell.noviceClass = noviceClass;
    }
  }

  return grid;
}

function matchElement(element: string): string | null {
  const lower = element.toLowerCase().trim();
  for (const canonical of AKC_SCENT_WORK_ELEMENTS) {
    if (canonical.toLowerCase() === lower) return canonical;
  }
  if (lower.includes('container')) return 'Container';
  if (lower.includes('interior')) return 'Interior';
  if (lower.includes('exterior')) return 'Exterior';
  if (lower.includes('buried')) return 'Buried';
  if (lower.includes('handler') && lower.includes('disc')) return 'Handler Discrimination';
  if (lower.includes('detective')) return 'Detective';
  return null;
}

function parseLevel(level: string): { level: string; noviceClass: 'A' | 'B' | null } {
  const trimmed = level.trim();
  const lower = trimmed.toLowerCase();

  if (lower.startsWith('novice')) {
    if (lower.endsWith('a') || lower.includes(' a')) {
      return { level: 'Novice', noviceClass: 'A' };
    }
    if (lower.endsWith('b') || lower.includes(' b')) {
      return { level: 'Novice', noviceClass: 'B' };
    }
    return { level: 'Novice', noviceClass: null };
  }

  if (lower.startsWith('advanced')) return { level: 'Advanced', noviceClass: null };
  if (lower.startsWith('excellent')) return { level: 'Excellent', noviceClass: null };
  if (lower.startsWith('master')) return { level: 'Master', noviceClass: null };

  return { level: trimmed, noviceClass: null };
}

export function groupEntriesByDog<T extends { dogId: string }>(entries: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const entry of entries) {
    const list = map.get(entry.dogId) ?? [];
    list.push(entry);
    map.set(entry.dogId, list);
  }
  return map;
}

export function sortEntryFormDogs(dogs: EntryFormDog[], sortOrder: string): EntryFormDog[] {
  const sorted = [...dogs];

  switch (sortOrder) {
    case 'owner-name':
      return sorted.sort((a, b) => {
        const aName = (a.owner.lastName ?? '').toLowerCase();
        const bName = (b.owner.lastName ?? '').toLowerCase();
        return aName.localeCompare(bName) || (a.armband ?? 0) - (b.armband ?? 0);
      });

    case 'dog-name':
      return sorted.sort((a, b) => {
        const aName = (a.registration?.registeredName ?? a.callName).toLowerCase();
        const bName = (b.registration?.registeredName ?? b.callName).toLowerCase();
        return aName.localeCompare(bName);
      });

    case 'armband':
    default:
      return sorted.sort((a, b) => (a.armband ?? 0) - (b.armband ?? 0));
  }
}
