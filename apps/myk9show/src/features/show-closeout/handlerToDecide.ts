/**
 * MYK9-2031: the live entries an exhibitor left as "I'll decide at the show" for the handler.
 *
 * "Live" is the show's own rule for an entry that will run (`isExpectedEntry`): a withdrawn,
 * pulled or moved entry no longer needs a handler. The flag is the server's; Change handler
 * clears it, so a settled entry drops out of the count on the next read.
 *
 * `undefined` is "unknown", never 0: a live entry whose flag this read does not carry (a row
 * cached before the migration, or the online fallback) means the count cannot be trusted.
 */
import { isExpectedEntry } from '@/features/_shared/entryAccounting';
import type { WhatIsLeftInput } from './whatIsLeft';

export interface HandlerToDecideEntry {
  class_id?: string | null | undefined;
  handler_to_decide?: boolean | null | undefined;
  entry_status?: string | null | undefined;
  check_in_status?: string | null | undefined;
}

export function readHandlerToDecide(
  entries: readonly HandlerToDecideEntry[]
): WhatIsLeftInput['handlerToDecide'] {
  // An entry with no class cannot be linked to, so it is neither counted nor listed.
  const live = entries.filter(
    entry =>
      !!entry.class_id &&
      isExpectedEntry({
        entry_status: entry.entry_status ?? undefined,
        check_in_status: entry.check_in_status ?? undefined,
      })
  );
  if (live.some(entry => typeof entry.handler_to_decide !== 'boolean')) return undefined;
  const open = live.filter(entry => entry.handler_to_decide === true);
  const classIds = [...new Set(open.map(entry => entry.class_id as string))];
  return { count: open.length, classIds };
}
