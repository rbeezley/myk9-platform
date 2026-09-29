import { supabase } from '../supabaseClient';

const receiptPrefix = 'myk9:secretary-empty:';

async function receiptKey(showId: string): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ? `${receiptPrefix}${data.session.user.id}:${showId}` : null;
  } catch {
    return null;
  }
}

export async function clearSecretaryEmptyProof(showId: string): Promise<void> {
  const key = await receiptKey(showId);
  if (key) {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // Browser storage may be disabled; online reads remain authoritative.
    }
  }
}

/** A replica's zero count is not proof that its RLS-filtered feed was complete. */
export async function verifySecretaryEmptyShow(showId: string): Promise<boolean> {
  const key = await receiptKey(showId);

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    try {
      return key !== null && globalThis.localStorage?.getItem(key) === 'verified';
    } catch {
      return false;
    }
  }

  const { data, error } = await supabase.rpc('get_secretary_live_entry_count', {
    p_show_id: showId,
  });
  if (error || typeof data !== 'number') {
    await clearSecretaryEmptyProof(showId);
    return false;
  }
  if (key) {
    try {
      if (data === 0) globalThis.localStorage?.setItem(key, 'verified');
      else globalThis.localStorage?.removeItem(key);
    } catch {
      // The server count still proves this online read.
    }
  }
  return data === 0;
}
