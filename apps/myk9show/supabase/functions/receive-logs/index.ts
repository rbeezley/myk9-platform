import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// CORS configuration
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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

// Shape sent by LoggingService RemoteTransport
interface LogPayload {
  entries: Array<{
    timestamp: string;
    level: number;
    message: string;
    category: string;
    userId?: string;
    sessionId?: string;
    metadata?: Record<string, unknown>;
    stack?: string;
    fingerprint?: string;
  }>;
  source: string;
  userAgent: string;
  url: string;
}

// Rate limiting: max entries per request
const MAX_ENTRIES_PER_REQUEST = 200;

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const payload: LogPayload = await req.json();

    if (!payload.entries || !Array.isArray(payload.entries) || payload.entries.length === 0) {
      return new Response(JSON.stringify({ error: 'No log entries provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Enforce size limit
    const entries = payload.entries.slice(0, MAX_ENTRIES_PER_REQUEST);

    // Map entries to database rows
    const rows = entries.map(entry => ({
      created_at: entry.timestamp || new Date().toISOString(),
      level: entry.level,
      message: (entry.message || '').substring(0, 2000),
      category: (entry.category || 'general').substring(0, 100),
      user_id: entry.userId || null,
      session_id: entry.sessionId || null,
      fingerprint: entry.fingerprint || null,
      stack: entry.stack ? entry.stack.substring(0, 5000) : null,
      metadata: entry.metadata || null,
      source: (payload.source || 'frontend').substring(0, 50),
      user_agent: payload.userAgent ? payload.userAgent.substring(0, 500) : null,
      page_url: payload.url ? payload.url.substring(0, 2000) : null,
    }));

    const { error } = await supabase.from('frontend_logs').insert(rows);

    if (error) {
      console.error('Failed to insert logs:', error.message);
      return new Response(JSON.stringify({ error: 'Failed to store logs' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ received: rows.length }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('receive-logs error:', err);
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
