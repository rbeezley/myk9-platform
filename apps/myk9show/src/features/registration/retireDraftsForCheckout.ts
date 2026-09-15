/**
 * Retire the wizard-draft lines a verified checkout has just filed (MYK9-509).
 *
 * The draft deliberately survives the cart hand-off so a CANCELLED checkout can
 * be resumed, which makes a verified SUCCESS the one point where those lines
 * are really filed. Lives here rather than inline in `CheckoutSuccessPage` so
 * that page does not grow, and so the auth lookup has one home: the wizard
 * saves under the auth user id, read from the LOCAL session rather than auth
 * context because the confirmation page renders outside an AuthProvider in its
 * own tests, and a payment confirmation must never fail to render over draft
 * bookkeeping.
 */

import { supabase } from '@/lib/supabase';
import { pruneWizardDraftsForFiledEntries } from '@/hooks/pruneWizardDraftsForFiledEntries';

export interface FiledEntryRow {
  dog_id?: string | null;
  class_id?: string | null;
}

export async function retireDraftsForCheckout(
  showId: string | undefined,
  rows: readonly FiledEntryRow[]
): Promise<void> {
  if (!showId) return;
  const filed = rows
    .map(row => ({ dogId: row.dog_id ?? '', classId: row.class_id ?? '' }))
    .filter(pair => pair.dogId && pair.classId);
  if (filed.length === 0) return;

  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id;
  if (!userId) return;

  pruneWizardDraftsForFiledEntries({ showId, userId, filed });
}
