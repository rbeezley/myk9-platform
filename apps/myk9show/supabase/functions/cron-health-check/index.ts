// Daily System Health check-runner. Runs the recurring, machine-checkable parts
// of the go-live runbook Phase 5 and INSERTs one row into
// public.system_health_snapshots; the /admin/health board reads the latest row.
//
// Design: openspec/changes/admin-system-health-check-runner/design.md
//
// Properties (mirroring cron-process-payouts):
// - Caller auth via x-function-secret (pg_cron / manual curl), never JWT.
// - Runs as service_role: has the INSERT grant on system_health_snapshots and
//   EXECUTE on system_health_probe(); bypasses RLS.
// - All privileged reads (cron.*, supabase_migrations.*) happen inside the
//   SECURITY DEFINER system_health_probe() — this function only shapes facts.
// - A probe failure still WRITES a `fail` snapshot (never a silent no-write) so
//   an outage surfaces on the board instead of aging quietly into staleness.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import * as Sentry from 'npm:@sentry/deno@10.62.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import {
  DAILY_HEALTH_MONITOR_SLUG,
  runWithBestEffortCronCheckIn,
  type CronCheckInClient,
} from '../_shared/sentryCronCheckIn.ts';
import {
  buildSnapshot,
  DEFAULT_SOURCE,
  extractConflictCounter,
} from '../_shared/systemHealthChecks.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const cronSecret = Deno.env.get('HEALTH_CRON_SECRET')!;

if (!supabaseUrl || !supabaseServiceKey || !cronSecret) {
  throw new Error('Missing required environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function createSentryCronClient(): CronCheckInClient | null {
  const dsn = Deno.env.get('SENTRY_DSN');
  if (!dsn) return null;

  try {
    Sentry.init({
      dsn,
      environment: Deno.env.get('SENTRY_ENVIRONMENT') || undefined,
      defaultIntegrations: false,
      sendDefaultPii: false,
    });

    return {
      captureCheckIn: checkIn => Sentry.captureCheckIn(checkIn),
      flush: timeoutMs => Sentry.flush(timeoutMs),
    };
  } catch (error) {
    console.warn(
      'Sentry Cron initialization failed:',
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

const sentryCronClient = createSentryCronClient();

// Constant-time secret check: hash both sides so the comparison cost is
// independent of how many leading bytes match (SA-002, same as the payout cron).
async function secretMatches(provided: string | null): Promise<boolean> {
  if (!provided) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(provided)),
    crypto.subtle.digest('SHA-256', enc.encode(cronSecret)),
  ]);
  const av = new Uint8Array(a);
  const bv = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
}

/** Previous snapshot's ringside conflict counter AND the time it was taken. The
 * timestamp is what lets the check report a rate rather than a bare delta — a
 * 24h delta of 1.4M reads as a broken counter, 992/min reads as a storm. Any
 * failure (no rows, query error, malformed checks) yields nulls = no baseline;
 * the check then records a fresh baseline instead of failing. */
async function fetchPreviousConflictBaseline(): Promise<{
  counter: number | null;
  at: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from('system_health_snapshots')
      .select('checks, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return { counter: null, at: null };
    const row = data as { checks?: unknown; created_at?: unknown };
    return {
      counter: extractConflictCounter(row.checks),
      at: typeof row.created_at === 'string' ? row.created_at : null,
    };
  } catch {
    return { counter: null, at: null };
  }
}

async function insertSnapshot(row: ReturnType<typeof buildSnapshot>) {
  const { error } = await supabase.from('system_health_snapshots').insert({
    source: row.source,
    overall_status: row.overall_status,
    checks: row.checks,
    run_duration_ms: row.run_duration_ms,
  });
  if (error) throw new Error(`snapshot insert failed: ${error.message}`);
}

async function runHealthSnapshot(): Promise<Response> {
  const startedAt = Date.now();
  const [
    { data: facts, error: probeError },
    { data: publicSchemaAcl, error: publicSchemaAclError },
  ] = await Promise.all([
    supabase.rpc('system_health_probe'),
    supabase.rpc('public_schema_create_acl_probe'),
  ]);

  if (probeError || facts == null) {
    // Probe failed — still write a visible fail snapshot rather than nothing.
    const snapshot = buildSnapshot(null, {
      now: Date.now(),
      runDurationMs: Date.now() - startedAt,
    });
    // Replace the generic detail with the actual probe error for triage.
    if (probeError) {
      snapshot.checks[0].detail = `system_health_probe failed: ${probeError.message}`;
    }
    await insertSnapshot(snapshot);
    console.error('Health probe failed:', probeError?.message ?? 'no facts returned');
    return Response.json(
      { source: snapshot.source, overall_status: snapshot.overall_status, probe_error: true },
      { status: 200 }
    );
  }

  const previous = await fetchPreviousConflictBaseline();

  const snapshot = buildSnapshot(
    {
      ...(facts as Record<string, unknown>),
      public_schema_create_acl: publicSchemaAclError
        ? { error: publicSchemaAclError.message }
        : publicSchemaAcl,
    },
    {
      now: Date.now(),
      source: DEFAULT_SOURCE,
      runDurationMs: Date.now() - startedAt,
      previousConflictCounter: previous.counter,
      previousSnapshotAt: previous.at,
    }
  );
  await insertSnapshot(snapshot);

  console.log(
    'Health check run:',
    JSON.stringify({
      overall_status: snapshot.overall_status,
      checks: snapshot.checks.map(c => ({ key: c.key, status: c.status })),
      run_duration_ms: snapshot.run_duration_ms,
    })
  );

  return Response.json({
    overall_status: snapshot.overall_status,
    checks: snapshot.checks.length,
    run_duration_ms: snapshot.run_duration_ms,
  });
}

Deno.serve(async req => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  if (!(await secretMatches(req.headers.get('x-function-secret')))) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    return await runWithBestEffortCronCheckIn(
      sentryCronClient,
      DAILY_HEALTH_MONITOR_SLUG,
      runHealthSnapshot
    );
  } catch (err) {
    // Last-resort: even the insert failed. Log loudly; the board's staleness
    // rule will surface the missing run within ~26h.
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('cron-health-check error:', message);
    return Response.json({ error: message }, { status: 500 });
  }
});
