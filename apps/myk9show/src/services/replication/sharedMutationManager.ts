/**
 * The app-wide shared MutationManager singleton.
 *
 * Lives in its own module (not the ReplicationSyncProvider component file) so
 * hooks can import it without pulling a component module — and so exporting it
 * doesn't trip react-refresh/only-export-components. The provider imports this,
 * wires it to every replicated table, and drives its lifecycle; sync-status
 * hooks import it read-only for getPendingCount().
 */

import { MutationManager, type MutationUploadAuthContext } from '@myk9/replication';
import { createSessionBoundSupabaseClient, supabase } from '@/services/database/supabaseClient';
import { logger } from '@/services/LoggingService';
import { acquireCacheClearWriteLock } from '@/services/cacheClearGate';

// Adapt myK9Show's LoggingService to the @myk9/replication Logger interface.
const replicationLogger = {
  log: (...args: unknown[]) => logger.debug(String(args[0]), 'replication'),
  warn: (...args: unknown[]) => logger.warn(String(args[0]), 'replication'),
  error: (...args: unknown[]) => {
    const msg = String(args[0]);
    const err = args[1];
    // Include actual error details (Supabase errors have message/code/details).
    if (err && typeof err === 'object') {
      const e = err as Record<string, unknown>;
      const details = e.message || e.code || e.details || JSON.stringify(err);
      logger.error(`${msg} ${details}`, 'replication');
    } else {
      logger.error(msg, 'replication');
    }
  },
  debug: (...args: unknown[]) => logger.debug(String(args[0]), 'replication'),
};

let cachedUploadContext:
  | {
      accessToken: string;
      value: MutationUploadAuthContext;
    }
  | undefined;

export const mutationManager = new MutationManager(supabase, {
  logger: replicationLogger,
  acquireQueueMutationLock: acquireCacheClearWriteLock,
  getCurrentUserId: async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session?.user.id ?? null;
  },
  getCurrentUploadContext: async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!data.session) {
      cachedUploadContext = undefined;
      return null;
    }
    if (cachedUploadContext?.accessToken === data.session.access_token) {
      return cachedUploadContext.value;
    }
    const value = {
      authUserId: data.session.user.id,
      supabaseClient: createSessionBoundSupabaseClient(data.session.access_token),
    };
    cachedUploadContext = { accessToken: data.session.access_token, value };
    return value;
  },
});
