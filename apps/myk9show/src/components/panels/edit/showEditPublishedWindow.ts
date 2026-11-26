import type { z } from 'zod';
import {
  ENTRY_WINDOW_PUBLISHED_MESSAGE,
  isPublicShowStatus,
} from '@/features/payments/onlineEntryGate';
import type { ShowEditFormData } from './ShowEditPanel.types';

/**
 * MYK9-2433: the database refuses clearing an entry date on a show that is already public
 * (enforce_show_publish_gate, MK005). Refuse it here, before the optimistic local write, with
 * the server's own wording. A date that was already empty when the panel opened is not a
 * change, so it never blocks. A draft show may still clear its dates.
 */
export function withPublishedEntryWindow(
  schema: z.ZodSchema<ShowEditFormData>,
  initialStatus: string | null | undefined,
  opened: Pick<ShowEditFormData, 'entryOpenDate' | 'entryCloseDate'>
): z.ZodSchema<ShowEditFormData> {
  if (!isPublicShowStatus(initialStatus)) return schema;
  return (schema as z.ZodType<ShowEditFormData>).superRefine((data, ctx) => {
    for (const field of ['entryOpenDate', 'entryCloseDate'] as const) {
      if (!data[field] && opened[field]) {
        ctx.addIssue({ code: 'custom', message: ENTRY_WINDOW_PUBLISHED_MESSAGE, path: [field] });
      }
    }
  });
}
