import type { Request } from '@playwright/test';

/** A requestfinished callback can settle after its page closes; skip that timing. */
export async function readSupabaseRequestDuration(
  request: Request,
  supabaseUrl: string | undefined
): Promise<{ path: string; durationMs: number } | null> {
  if (!supabaseUrl || !request.url().startsWith(supabaseUrl)) return null;
  try {
    const response = await request.response();
    if (!response) return null;
    return {
      path: new URL(request.url()).pathname,
      durationMs: response.request().timing().responseEnd,
    };
  } catch {
    return null;
  }
}
