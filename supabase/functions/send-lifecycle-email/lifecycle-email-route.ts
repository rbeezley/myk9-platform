import { HttpError } from '../_shared/http/responses.ts';
import { timingSafeEqual } from '../_shared/timingSafeEqual.ts';
import { drainAutoEmailJobs } from './lifecycle-email-autoSend.ts';
import { createSendLifecycleEmailHandler } from './lifecycle-email-handler.ts';
import type {
  LifecycleEmailSupabaseClient,
  SendLifecycleEmailDeps,
  SendLifecycleEmailPayload,
} from './lifecycle-email-shared.ts';

interface AuthClient {
  auth: {
    getUser(token: string): PromiseLike<{ data: { user: { id: string } | null }; error: unknown }>;
  };
}

/**
 * The function's one entry point. `drain_auto` is the cron's: it carries the project's
 * service key and the confirmation cron secret in x-function-secret (the same secret and
 * header as send-confirmation-email's cron scopes), and no user. Every other action is a
 * signed-in secretary's, exactly as before: bearer JWT in, the same handler out.
 */
export function createLifecycleEmailRoute(
  deps: SendLifecycleEmailDeps,
  getEnv: (name: string) => string | undefined = name => Deno.env.get(name)
) {
  const userHandler = createSendLifecycleEmailHandler(deps);
  return async (ctx: {
    req: Request;
    body: SendLifecycleEmailPayload;
    supabase: LifecycleEmailSupabaseClient & AuthClient;
  }) => {
    if (ctx.body?.action === 'drain_auto') {
      requireCronSecret(ctx.req, getEnv);
      if (!deps.resendApiKey) throw new HttpError(503, 'Email service not configured');
      return drainAutoEmailJobs({ deps, supabase: ctx.supabase });
    }

    const token = ctx.req.headers.get('Authorization')?.replace('Bearer ', '').trim();
    if (!token) throw new HttpError(401, 'Unauthorized');
    const { data, error } = await ctx.supabase.auth.getUser(token);
    if (error || !data?.user) throw new HttpError(401, 'Unauthorized');
    return userHandler({ body: ctx.body, user: data.user, supabase: ctx.supabase });
  };
}

function requireCronSecret(req: Request, getEnv: (name: string) => string | undefined) {
  const secret = getEnv('HERITAGE_CONFIRMATION_SECRET');
  if (!secret) throw new HttpError(503, 'Automatic email auth not configured');
  const provided = req.headers.get('x-function-secret');
  if (!provided || !timingSafeEqual(provided, secret)) throw new HttpError(401, 'Unauthorized');
}
