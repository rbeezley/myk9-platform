// Re-export shim — pure helpers moved to @myk9/ringside in PR E2d-2a.
// See packages/ringside/src/pages/EntryList/combinedEntryListHelpers.ts
// and docs/plans/phase-0-ringside-package.md.
//
// What stayed: `fetchClassRequirements` is the one helper that touches
// Supabase directly (queries the `class_requirements` table). Ringside
// is not a host of the supabase client — moving this would force the
// client into ringside's DI surface for marginal benefit. Stays here.
//
// What moved: `parseOrganizationData`, `compareEntries`, `parseTimeLimit`,
// `getScoresheetNavigationRoute`, `PRINT_DIALOG_TITLES`, and the
// `useEntryHandlers` hook. None of them touched a service; all were
// pure logic or composed already-injected callbacks.

import { supabase } from '../../lib/supabase';
import { logger } from '@/utils/logger';

// Pure helpers + hook now live in ringside. Re-exports preserve the
// existing import paths until E2d-2b consolidates them.
export {
  parseOrganizationData,
  compareEntries,
  parseTimeLimit,
  getScoresheetNavigationRoute,
  PRINT_DIALOG_TITLES,
  useEntryHandlers,
} from '@myk9/ringside';

/**
 * Fetch class requirements (hides/distractions) from database.
 *
 * Stays host-side because it queries Supabase directly. Master-level
 * classes intentionally skip the fetch — the requirements are
 * understood by judges at that level without needing the document.
 */
export async function fetchClassRequirements(
  orgData: { organization: string },
  element?: string,
  level?: string,
): Promise<{ hidesText: string | undefined; distractionsText: string | undefined }> {
  const isMasterLevel = level?.toLowerCase().includes('master');
  if (isMasterLevel || !orgData.organization || !element || !level) {
    return { hidesText: undefined, distractionsText: undefined };
  }

  try {
    const { data: requirements } = await supabase
      .from('class_requirements')
      .select('hides, distractions')
      .eq('organization', orgData.organization)
      .eq('element', element)
      .eq('level', level)
      .single();

    if (requirements) {
      return { hidesText: requirements.hides, distractionsText: requirements.distractions };
    }
  } catch (reqError) {
    logger.warn('Could not fetch class requirements:', reqError);
  }
  return { hidesText: undefined, distractionsText: undefined };
}
