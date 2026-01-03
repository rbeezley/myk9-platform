import { supabase } from '@/lib/supabase';
import { Entry } from '@/stores/entryStore';
import { triggerImmediateEntrySync } from '../entryReplication';
import { logger } from '@/utils/logger';

/**
 * Entry Batch Operations Service
 *
 * Handles batch update operations on multiple entries, including:
 * - Exhibitor order updates (drag-and-drop reordering)
 * - Future batch operations (status updates, bulk scoring, etc.)
 *
 * **Phase 4, Task 4.1** - Extracted from entryService.ts
 *
 * **Key Features**:
 * - Parallel execution with Promise.all() for performance
 * - Automatic replication sync after updates
 * - Comprehensive error handling and logging
 * - 1-based indexing for exhibitor_order
 *
 * **Use Cases**:
 * - Admin drag-and-drop reordering in class lists
 * - Bulk entry management operations
 * - Multi-entry updates in admin panels
 */

/**
 * Update exhibitor order for multiple entries
 *
 * Used for drag-and-drop reordering in admin class lists.
 * Updates the database so all users see the new order via real-time sync.
 *
 * **Implementation Details**:
 * - Uses 1-based indexing (first entry = 1, not 0)
 * - Executes updates in parallel for performance
 * - Triggers immediate sync for instant UI updates
 * - Throws on any individual update failure
 *
 * **Performance**:
 * - Parallel execution: ~100-200ms for 10-20 entries
 * - Sequential would be: ~1-2 seconds for same count
 * - Network-bound, scales linearly with entry count
 *
 * @param reorderedEntries - Array of entries in new order (index = new position)
 * @returns Promise<boolean> - true if all updates successful
 * @throws Error if any individual update fails
 *
 * @example
 * // After drag-and-drop reorder
 * const newOrder = [...entries]; // Array already in new order
 * // Move entry from index 3 to index 0
 * const [moved] = newOrder.splice(3, 1);
 * newOrder.unshift(moved);
 *
 * await updateExhibitorOrder(newOrder);
 * // Database now reflects: entry IDs with exhibitor_order 1, 2, 3, ...
 *
 * @example
 * // Reverse entire list
 * const reversed = [...entries].reverse();
 * await updateExhibitorOrder(reversed);
 */
export async function updateExhibitorOrder(
  reorderedEntries: Entry[]
): Promise<boolean> {
  try {
    // Update each entry with its new position (1-based indexing)
    // Use a single timestamp for all updates to ensure consistency
    const updatedAtTimestamp = new Date().toISOString();

    const updates = reorderedEntries.map(async (entry, index) => {
      const newExhibitorOrder = index + 1; // 1-based indexing

      const { error } = await supabase
        .from('entries')
        .update({ exhibitor_order: newExhibitorOrder, updated_at: updatedAtTimestamp })
        .eq('id', entry.id)
        .select('id, exhibitor_order');

      if (error) {
        logger.error(`Failed to update entry ${entry.id}:`, error);
        throw error;
      }

      return { id: entry.id, newOrder: newExhibitorOrder };
    });

    // Execute all updates in parallel
    await Promise.all(updates);

    // Trigger immediate sync so UI updates instantly across all devices
    await triggerImmediateEntrySync('updateExhibitorOrder');

    return true;
  } catch (error) {
    logger.error('Error in updateExhibitorOrder:', error);
    throw error;
  }
}

/**
 * Calculate new exhibitor orders for reordered entries
 *
 * Helper function to preview what exhibitor_order values will be assigned
 * without actually updating the database. Useful for validation or UI preview.
 *
 * @param entries - Array of entries in desired order
 * @returns Array of {entryId, newOrder} tuples
 *
 * @private Internal helper - exposed for testing
 *
 * @example
 * const preview = calculateNewOrders(reorderedEntries);
 * logger.log('New orders:', preview);
 * // [{ entryId: 123, newOrder: 1 }, { entryId: 456, newOrder: 2 }, ...]
 */
export function calculateNewOrders(
  entries: Entry[]
): Array<{ entryId: number; newOrder: number }> {
  return entries.map((entry, index) => ({
    entryId: entry.id,
    newOrder: index + 1, // 1-based indexing
  }));
}

/**
 * Validate exhibitor order array
 *
 * Ensures the reordered array is valid before attempting updates:
 * - Not empty
 * - All entries have valid IDs
 * - No duplicate IDs
 *
 * @param entries - Array of entries to validate
 * @returns {valid: boolean, error?: string}
 *
 * @private Internal helper - exposed for testing
 *
 * @example
 * const validation = validateExhibitorOrderArray(entries);
 * if (!validation.valid) {
 *   throw new Error(validation.error);
 * }
 */
export function validateExhibitorOrderArray(
  entries: Entry[]
): { valid: boolean; error?: string } {
  // Check for empty array
  if (!entries || entries.length === 0) {
    return { valid: false, error: 'Entries array is empty' };
  }

  // Check for invalid IDs
  const invalidEntry = entries.find(e => !e.id || e.id <= 0);
  if (invalidEntry) {
    return {
      valid: false,
      error: `Entry has invalid ID: ${JSON.stringify(invalidEntry)}`
    };
  }

  // Check for duplicate IDs
  const ids = entries.map(e => e.id);
  const uniqueIds = new Set(ids);
  if (ids.length !== uniqueIds.size) {
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    return {
      valid: false,
      error: `Duplicate entry IDs found: ${duplicates.join(', ')}`
    };
  }

  return { valid: true };
}
