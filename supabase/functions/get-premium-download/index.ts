import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';
import { processRequest } from '../_shared/http/handler.ts';
import { MYK9SHOW_ORIGINS } from '../_shared/http/cors.ts';
import { HttpError } from '../_shared/http/responses.ts';
import { hasShowManagementAccess } from './premiumDownloadAuth.ts';
import {
  requestPremiumDownload,
  preventPremiumDownloadResponseCaching,
  type PremiumDownloadBackend,
  type PremiumDownloadRow,
} from './premiumDownload.ts';

const BUCKET = 'premium-published';

interface ShowQuery {
  select(columns: string): {
    eq(
      column: 'id',
      showId: string
    ): {
      maybeSingle(): Promise<{ data: PremiumDownloadRow | null; error: unknown | null }>;
    };
  };
}

interface PremiumDownloadClient {
  auth: {
    getUser(token: string): Promise<{ data: { user?: unknown | null } | null; error: unknown | null }>;
  };
  rpc(
    functionName: 'can_manage_show' | 'is_show_secretary',
    args: { check_show_id: string }
  ): Promise<{ data: boolean | null; error: unknown | null }>;
  from(table: 'shows'): ShowQuery;
  storage: {
    from(bucket: string): {
      createSignedUrl(
        path: string,
        expiresIn: number
      ): Promise<{
        data: { signedUrl?: string | null } | null;
        error: unknown | null;
      }>;
    };
  };
}

function createBackend(
  client: unknown,
  authorizationHeader: string | null,
  supabaseUrl: string,
  anonKey: string | undefined
): PremiumDownloadBackend {
  const supabase = client as PremiumDownloadClient;
  return {
    readVersioned: showId =>
      supabase
        .from('shows')
        .select('id,status,deleted_at,published_premium_path,published_premium_url')
        .eq('id', showId)
        .maybeSingle(),
    readLegacy: showId =>
      supabase
        .from('shows')
        .select('id,status,deleted_at,published_premium_url')
        .eq('id', showId)
        .maybeSingle(),
    canPreview: (showId, header) =>
      hasShowManagementAccess(showId, header ?? authorizationHeader, {
        getUser: async token => {
          const { data, error } = await supabase.auth.getUser(token);
          if (error) {
            const status =
              typeof error === 'object' && error !== null && 'status' in error
                ? Number((error as { status?: unknown }).status)
                : undefined;
            if (status === 401) return { userExists: false };
            throw error;
          }
          return { userExists: Boolean(data?.user) };
        },
        checkShowAccess: async (authorizedShowId, token) => {
          if (!anonKey) throw new Error('Supabase anon key is not configured');
          const userClient = createClient(supabaseUrl, anonKey, {
            auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
            global: { headers: { Authorization: `Bearer ${token}` } },
          });
          const [manager, secretary] = await Promise.all([
            userClient.rpc('can_manage_show', { check_show_id: authorizedShowId }),
            userClient.rpc('is_show_secretary', { check_show_id: authorizedShowId }),
          ]);
          if (manager.error) throw manager.error;
          if (secretary.error) throw secretary.error;
          return { canManage: manager.data === true, isSecretary: secretary.data === true };
        },
      }),
    sign: (path, expiresIn) => supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn),
  };
}

export async function processPremiumDownloadRequest(req: Request): Promise<Response> {
  const response = await processRequest<{ show_id?: unknown }>(
    req,
    { auth: 'none', origins: MYK9SHOW_ORIGINS },
    async ({ body, req: request, supabase }) => {
      const url = await requestPremiumDownload(
        body,
        createBackend(
          supabase,
          request.headers.get('Authorization'),
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_ANON_KEY')
        ),
        request.headers.get('Authorization')
      );
    if (!url) throw new HttpError(404, 'Not found');
    return { url };
    },
    {
      getEnv: name => Deno.env.get(name),
      makeClient: (url, key) => createClient(url, key) as unknown as SupabaseClient,
    }
  );
  return preventPremiumDownloadResponseCaching(response);
}

Deno.serve(processPremiumDownloadRequest);
