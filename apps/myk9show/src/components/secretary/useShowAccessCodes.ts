import { useEffect, useState } from 'react';
import { friendlyDbError } from '@/utils/friendlyDbError';
import type { AccessCodeRpcRow } from './accessCodeRows';
import { fetchShowAccessCodes } from './fetchShowAccessCodes';

export type AccessCodeLoadState = 'idle' | 'loading' | 'loaded' | 'error';

/**
 * Reads get_show_access_codes (online-only RPC) when `enabled`. `reload` re-reads, which is how
 * the per-judge codes come back after a show is created or its codes are regenerated: neither
 * insert_show_passcodes nor regenerate_show_passcodes returns a judge code.
 */
export function useShowAccessCodes(showId: string, enabled: boolean) {
  const [codes, setCodes] = useState<AccessCodeRpcRow[]>([]);
  const [state, setState] = useState<AccessCodeLoadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    let active = true;
    void (async () => {
      try {
        const { data, error: rpcError } = await fetchShowAccessCodes(showId);

        if (!active) return;
        if (rpcError) {
          setError(friendlyDbError(rpcError, "Couldn't load show access codes. Try again."));
          setState('error');
          return;
        }
        setCodes(data ?? []);
        setState('loaded');
      } catch (caught) {
        if (!active) return;
        setError(friendlyDbError(caught, "Couldn't load show access codes. Try again."));
        setState('error');
      }
    })();

    return () => {
      active = false;
    };
  }, [enabled, attempt, showId]);

  const reload = () => {
    // Loading first, so no render shows the codes this call is about to replace.
    setState('loading');
    setError(null);
    setAttempt(current => current + 1);
  };

  return { codes, state, error, reload };
}
