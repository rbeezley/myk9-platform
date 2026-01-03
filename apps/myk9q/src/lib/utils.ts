import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Get the standard sort order for competition levels
 * Returns a numeric value representing the progression order
 *
 * Standard progression: Novice (1) -> Advanced (2) -> Excellent (3) -> Master (4) -> Summit (5)
 *
 * @param level - The level string to evaluate
 * @returns Numeric sort order (1-5 for standard levels, 999 for unknown)
 *
 * @example
 * getLevelSortOrder('Novice') // 1
 * getLevelSortOrder('Advanced A') // 2
 * getLevelSortOrder('Master Elite') // 4
 */
export function getLevelSortOrder(level: string): number {
  // Define exact level mappings
  const levelOrder: Record<string, number> = {
    'Novice': 1,
    'Novice A': 1,
    'Novice B': 1,
    'Novice Preferred': 1,
    'Advanced': 2,
    'Advanced A': 2,
    'Advanced B': 2,
    'Advanced Preferred': 2,
    'Excellent': 3,
    'Excellent A': 3,
    'Excellent B': 3,
    'Excellent Preferred': 3,
    'Master': 4,
    'Masters': 4,
    'Master Elite': 4,
    'Detective': 4,
    'Summit': 5
  };

  // Check exact match first
  if (levelOrder[level] !== undefined) {
    return levelOrder[level];
  }

  // Fuzzy match on level name (case-insensitive)
  const levelLower = level.toLowerCase();
  if (levelLower.includes('novice')) return 1;
  if (levelLower.includes('advanced')) return 2;
  if (levelLower.includes('excellent')) return 3;
  if (levelLower.includes('master')) return 4;
  if (levelLower.includes('summit')) return 5;

  // Unknown levels sort to the end
  return 999;
}