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

interface DeleteRequest {
  personId: string;
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

    // 2. Verify caller is SITE_ADMIN
    const { data: callerPerson, error: callerError } = await supabase
      .from('people')
      .select('id')
      .eq('auth_user_id', user.id)
      .is('deleted_at', null)
      .single();

    if (callerError || !callerPerson) {
      return corsResponse({ error: 'Caller not found' }, 403);
    }

    // Check if caller is site_admin via RBAC
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
    const body: DeleteRequest = await req.json();
    const { personId } = body;

    if (!personId) {
      return corsResponse({ error: 'Missing required parameter: personId' }, 400);
    }

    // Prevent self-deletion
    if (personId === callerPerson.id) {
      return corsResponse({ error: 'Cannot delete your own account' }, 400);
    }

    // 4. Look up target person's auth_user_id
    // Intentionally does NOT filter by deleted_at — allows admins to
    // permanently purge soft-deleted users from the Data Lifecycle page
    const { data: targetPerson, error: targetError } = await supabase
      .from('people')
      .select('id, first_name, last_name, auth_user_id')
      .eq('id', personId)
      .single();

    if (targetError || !targetPerson) {
      return corsResponse({ error: 'User not found' }, 404);
    }

    // 5. Hard-delete the people row (CASCADE handles dependent tables)
    const { error: deleteError } = await supabase.from('people').delete().eq('id', personId);

    if (deleteError) {
      console.error('Failed to delete people row:', deleteError);
      return corsResponse({ error: 'Failed to delete user record' }, 500);
    }

    // 6. Delete auth.users entry if it exists
    if (targetPerson.auth_user_id) {
      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(
        targetPerson.auth_user_id
      );

      if (authDeleteError) {
        // Log but don't fail — the people row is already deleted
        console.error('Failed to delete auth user (people row already removed):', authDeleteError);
      }
    }

    console.log(
      `User permanently deleted: ${targetPerson.first_name} ${targetPerson.last_name} (${personId}) by admin ${callerPerson.id}`
    );

    return corsResponse({
      success: true,
      deleted: {
        personId,
        authUserDeleted: !!targetPerson.auth_user_id,
      },
    });
  } catch (error: unknown) {
    console.error('Admin delete user error:', error);
    return corsResponse(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});
