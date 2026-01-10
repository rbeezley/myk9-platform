import { supabase } from './database/supabaseClient';
import { logger } from '@/utils/logger';

/**
 * Mark an entry as being in the ring or not.
 * 
 * @param entryId - The entry ID to update
 * @param inRing - Whether the dog is in the ring
 * @param previousStatus - Optional: The status to restore if inRing is false
 */
export async function markInRing(
    entryId: number,
    inRing: boolean = true,
    previousStatus: string = 'checked-in'
): Promise<boolean> {
    try {
        const status = inRing ? 'in-ring' : previousStatus;

        const { error } = await supabase
            .from('entry')
            .update({
                status: status,
                updated_at: new Date().toISOString()
            })
            .eq('id', entryId);

        if (error) {
            logger.error(`[entryService] Error marking entry ${entryId} as in-ring:`, error);
            return false;
        }

        return true;
    } catch (error) {
        logger.error(`[entryService] Exception marking entry ${entryId} as in-ring:`, error);
        return false;
    }
}
