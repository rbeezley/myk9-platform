/**
 * Run Order Service
 *
 * Handles calculating and applying run order presets for entry lists.
 * Provides functions to reorder entries based on armband, section, or random shuffle.
 */

import { Entry } from '../stores/entryStore';
import { updateExhibitorOrder } from './entryService';
import { RunOrderPreset } from '../components/dialogs/RunOrderDialog';
import { logger } from '@/utils/logger';

/**
 * Calculate new exhibitor_order values based on preset
 * Returns a new array of entries with updated exhibitorOrder property
 */
export function calculateRunOrder(
  entries: Entry[],
  preset: RunOrderPreset
): Entry[] {
  let orderedEntries: Entry[];

  switch (preset) {
    case 'a-then-b-asc':
      orderedEntries = calculateSectionOrder(entries, 'A', 'B', 'asc');
      break;

    case 'a-then-b-desc':
      orderedEntries = calculateSectionOrder(entries, 'A', 'B', 'desc');
      break;

    case 'b-then-a-asc':
      orderedEntries = calculateSectionOrder(entries, 'B', 'A', 'asc');
      break;

    case 'b-then-a-desc':
      orderedEntries = calculateSectionOrder(entries, 'B', 'A', 'desc');
      break;

    case 'combined-asc':
    case 'armband-asc':
      orderedEntries = [...entries].sort((a, b) => a.armband - b.armband);
      break;

    case 'combined-desc':
    case 'armband-desc':
      orderedEntries = [...entries].sort((a, b) => b.armband - a.armband);
      break;

    case 'random-all':
    case 'random':
      orderedEntries = shuffleArray([...entries]);
      break;

    case 'random-sections':
      orderedEntries = calculateRandomSections(entries);
      break;

    default:
      // Fallback to armband ascending
      orderedEntries = [...entries].sort((a, b) => a.armband - b.armband);
  }

  // Assign exhibitorOrder values (1-based indexing)
  return orderedEntries.map((entry, index) => ({
    ...entry,
    exhibitorOrder: index + 1
  }));
}

/**
 * Calculate section-based ordering (A then B, or B then A)
 */
function calculateSectionOrder(
  entries: Entry[],
  firstSection: string,
  secondSection: string,
  direction: 'asc' | 'desc'
): Entry[] {
  const firstSectionEntries = entries
    .filter(e => e.section === firstSection)
    .sort((a, b) => direction === 'asc' ? a.armband - b.armband : b.armband - a.armband);

  const secondSectionEntries = entries
    .filter(e => e.section === secondSection)
    .sort((a, b) => direction === 'asc' ? a.armband - b.armband : b.armband - a.armband);

  // Handle entries without sections (shouldn't happen for Novice, but be defensive)
  const otherEntries = entries
    .filter(e => e.section !== firstSection && e.section !== secondSection)
    .sort((a, b) => a.armband - b.armband);

  return [...firstSectionEntries, ...secondSectionEntries, ...otherEntries];
}

/**
 * Calculate random shuffle within each section separately
 */
function calculateRandomSections(entries: Entry[]): Entry[] {
  const aSectionEntries = shuffleArray(entries.filter(e => e.section === 'A'));
  const bSectionEntries = shuffleArray(entries.filter(e => e.section === 'B'));
  const otherEntries = shuffleArray(entries.filter(e => e.section !== 'A' && e.section !== 'B'));

  return [...aSectionEntries, ...bSectionEntries, ...otherEntries];
}

/**
 * Fisher-Yates shuffle algorithm for randomizing array
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Apply run order preset to entries and update database
 * Returns the reordered entries with updated exhibitorOrder values
 */
export async function applyRunOrderPreset(
  entries: Entry[],
  preset: RunOrderPreset
): Promise<Entry[]> {
  try {
// Calculate new order
    const reorderedEntries = calculateRunOrder(entries, preset);

    // Update database
    await updateExhibitorOrder(reorderedEntries);

return reorderedEntries;
  } catch (error) {
    logger.error('❌ Error applying run order preset:', error);
    throw error;
  }
}

export type RunOrderScope = 'all' | 'A' | 'B';
export type RenumberMode = 'preserve' | 'renumber';

/**
 * Apply run order preset with scope support for A/B sections.
 * When scope is 'all', delegates to standard applyRunOrderPreset.
 * When scope is 'A' or 'B', only reorders that section's entries.
 */
export async function applyRunOrderPresetScoped(
  entries: Entry[],
  preset: RunOrderPreset,
  scope: RunOrderScope,
  renumberMode: RenumberMode
): Promise<Entry[]> {
  // Scope 'all' → use existing behavior
  if (scope === 'all') {
    return applyRunOrderPreset(entries, preset);
  }

  try {
    const otherSection = scope === 'A' ? 'B' : 'A';
    const scopedEntries = entries.filter(e => e.section === scope);
    const otherEntries = entries.filter(e => e.section === otherSection);
    const remainingEntries = entries.filter(e => e.section !== scope && e.section !== otherSection);

    // Calculate new order for the scoped section only
    const reorderedScoped = calculateRunOrder(scopedEntries, preset);

    let finalEntries: Entry[];

    if (renumberMode === 'preserve') {
      // Keep other section's exhibitorOrder, only update scoped section
      // Scoped entries get new order values, other entries stay unchanged
      const maxOtherOrder = Math.max(0, ...otherEntries.map(e => e.exhibitorOrder || 0));
      const reindexedScoped = reorderedScoped.map((entry, index) => ({
        ...entry,
        exhibitorOrder: maxOtherOrder + index + 1
      }));
      finalEntries = [...otherEntries, ...reindexedScoped, ...remainingEntries];
    } else {
      // Renumber all: scoped section first (1, 2, 3...), then other section continues
      const reindexedScoped = reorderedScoped.map((entry, index) => ({
        ...entry,
        exhibitorOrder: index + 1
      }));
      const reindexedOther = otherEntries
        .sort((a, b) => (a.exhibitorOrder || 0) - (b.exhibitorOrder || 0))
        .map((entry, index) => ({
          ...entry,
          exhibitorOrder: reindexedScoped.length + index + 1
        }));
      const reindexedRemaining = remainingEntries.map((entry, index) => ({
        ...entry,
        exhibitorOrder: reindexedScoped.length + reindexedOther.length + index + 1
      }));
      finalEntries = [...reindexedScoped, ...reindexedOther, ...reindexedRemaining];
    }

    await updateExhibitorOrder(finalEntries);
    return finalEntries;
  } catch (error) {
    logger.error('❌ Error applying scoped run order preset:', error);
    throw error;
  }
}

/**
 * Get human-readable description of preset
 */
export function getPresetDescription(preset: RunOrderPreset): string {
  const descriptions: Record<RunOrderPreset, string> = {
    'a-then-b-asc': 'Section A then B (Armband Low to High)',
    'a-then-b-desc': 'Section A then B (Armband High to Low)',
    'b-then-a-asc': 'Section B then A (Armband Low to High)',
    'b-then-a-desc': 'Section B then A (Armband High to Low)',
    'combined-asc': 'Combined (Armband Low to High)',
    'combined-desc': 'Combined (Armband High to Low)',
    'armband-asc': 'Armband Low to High',
    'armband-desc': 'Armband High to Low',
    'random-all': 'Random Shuffle (all dogs)',
    'random-sections': 'Random Shuffle (within sections)',
    'random': 'Random Shuffle',
    'manual': 'Manual Drag and Drop'
  };

  return descriptions[preset] || preset;
}
