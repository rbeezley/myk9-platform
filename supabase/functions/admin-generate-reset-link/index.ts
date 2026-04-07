import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing required environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// CORS configuration — same origins as other Edge Functions
const ALLOWED_ORIGINS = [
  'https://myk9show.com',
  'https://www.myk9show.com',
  'https://app.myk9show.com',
  'https://myk9-platform-myk9show.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
];

function getCorsHeaders(requestOrigin: string | null): Record<string, string> {
  const origin =
    requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

let _corsHeaders: Record<string, string> = getCorsHeaders(null);

function corsResponse(body: string | object | null, status = 200) {
  if (status === 204) {
    return new Response(null, { status, headers: _corsHeaders });
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: { ..._corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface GenerateResetLinkRequest {
  targetEmail: string;
}

Deno.serve(async req => {
  _corsHeaders = getCorsHeaders(req.headers.get('origin'));

  try {
    if (req.method === 'OPTIONS') {
      return corsResponse({}, 204);
    }

    if (req.method !== 'POST') {
      return corsResponse({ error: 'Method not allowed' }, 405);
    }

    // 1. Authenticate caller
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return corsResponse({ error: 'Missing Authorization header' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Authentication failed:', authError);
      return corsResponse({ error: 'Authentication failed' }, 401);
    }

    // 2. Verify caller is site_admin
    const { data: callerPerson, error: callerError } = await supabase
      .from('people')
      .select('id')
      .eq('auth_user_id', user.id)
      .is('deleted_at', null)
      .single();

    if (callerError || !callerPerson) {
      return corsResponse({ error: 'Caller not found' }, 403);
    }

    const { data: rbacRoles } = await supabase
      .from('user_roles')
      .select('role:roles(name)')
      .eq('user_id', callerPerson.id)
      .eq('is_active', true);

    const isSiteAdmin =
      rbacRoles?.some((r: { role: { name: string } | null }) => r.role?.name === 'site_admin') ??
      false;

    if (!isSiteAdmin) {
      return corsResponse({ error: 'Unauthorized: requires site_admin role' }, 403);
    }

    // 3. Parse request
    const body: GenerateResetLinkRequest = await req.json();
    const { targetEmail } = body;

    if (!targetEmail) {
      return corsResponse({ error: 'Missing required parameter: targetEmail' }, 400);
    }

    // 4. Generate password recovery link using admin API
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: targetEmail,
    });

    if (linkError || !linkData) {
      console.error('Failed to generate reset link:', linkError);
      return corsResponse({ error: linkError?.message ?? 'Failed to generate reset link' }, 500);
    }

    console.log(`Password reset link generated for ${targetEmail} by admin ${callerPerson.id}`);

    return corsResponse({
      success: true,
      link: linkData.properties?.action_link ?? null,
    });
  } catch (error: unknown) {
    console.error('Admin generate reset link error:', error);
    return corsResponse(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});
