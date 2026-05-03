import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? 'http://localhost:5173',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1024;

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  try {
    // Step 1: Validate authorization header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header' }, 401);
    }

    // Step 2: Validate required env vars
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!serviceRoleKey || !anthropicKey) {
      console.error('Missing required env vars: SUPABASE_SERVICE_ROLE_KEY or ANTHROPIC_API_KEY');
      return jsonResponse({ error: 'Service configuration error' }, 500);
    }

    // Step 3: Create clients
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const serviceClient = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);

    // Step 4: Authenticate user
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    // Step 5: Parse request body
    let body: { show_id?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }
    const { show_id } = body;
    if (!show_id) {
      return jsonResponse({ error: 'show_id is required' }, 400);
    }

    // Step 6: Fetch show data with nested relations
    const { data: show, error: showError } = await serviceClient
      .from('shows')
      .select(
        `
        id, name, organization, start_date, end_date, location,
        entry_open_date, entry_close_date, pre_entry_fee, day_of_show_fee,
        accept_check_payments, accept_cash_payments, club_id,
        secretary, secretary_email,
        clubs(name, logo_url),
        trials(
          id, name, date, planned_start_time, event_number, trial_type,
          judge_assignments(
            people(id, first_name, last_name)
          ),
          classes(id, name, level, element, section)
        )
      `
      )
      .eq('id', show_id)
      .single();

    if (showError || !show) {
      return jsonResponse({ error: 'Show not found' }, 404);
    }

    // Step 7: Auth check — verify user is SITE_ADMIN, CLUB_ADMIN, or SECRETARY for this club
    // Uses the same user_roles + auth_user_id pattern as is_trial_secretary() (migration 156)
    const { data: roleRows } = await serviceClient
      .from('user_roles')
      .select('role:roles(name), club_id, is_active, expires_at')
      .eq('auth_user_id', user.id);

    const now = new Date().toISOString();
    const activeRoles = (roleRows ?? []).filter(
      (r: { is_active: boolean; expires_at: string | null }) =>
        r.is_active && (r.expires_at === null || r.expires_at > now)
    );

    const roleNames = activeRoles.map((r: { role: { name: string } | null }) => r.role?.name ?? '');

    const isAdmin =
      roleNames.includes('site_admin') ||
      activeRoles.some(
        (r: { role: { name: string } | null; club_id: string | null }) =>
          r.role?.name === 'club_admin' && r.club_id === show.club_id
      );

    // Secretary check: role name 'secretary' scoped to this club (club_id matches)
    // Mirrors the club-scoped secretary pattern from migration 163
    const isSecretary =
      !isAdmin &&
      activeRoles.some(
        (r: { role: { name: string } | null; club_id: string | null }) =>
          (r.role?.name === 'secretary' || r.role?.name === 'trial_secretary') &&
          r.club_id === show.club_id
      );

    if (!isAdmin && !isSecretary) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }

    // Step 8: Template resolution — find best matching template for this show's trial type
    const { data: templates } = await serviceClient
      .from('club_premium_templates')
      .select('*')
      .eq('club_id', show.club_id);

    const trialType =
      (show.trials as Array<{ trial_type: string | null }>)?.[0]?.trial_type ?? null;
    const template =
      (templates ?? []).find(
        (t: { trial_type: string | null; is_default: boolean }) =>
          t.trial_type === trialType && t.trial_type !== null
      ) ??
      (templates ?? []).find((t: { is_default: boolean }) => t.is_default) ??
      null;

    // Step 9: Claude API call — generate narrative sections
    const showSummary = buildShowSummary(show);
    let narratives: { showHours: string; trialInformation: string } = {
      showHours: '',
      trialInformation: '',
    };

    try {
      narratives = await generateNarratives(showSummary, anthropicKey);
    } catch (err) {
      console.error('Claude narrative generation failed:', err);
      narratives = {
        showHours: 'Show hours to be announced.',
        trialInformation: 'Trial information to be announced.',
      };
    }

    // Step 10: Assemble and return GeneratedPremium
    const trials = (
      show.trials as Array<{
        id: string;
        name: string;
        date: string;
        planned_start_time: string | null;
        event_number: string | null;
        trial_type: string | null;
        judge_assignments: Array<{
          people: { id: string; first_name: string; last_name: string } | null;
        }>;
        classes: Array<{
          id: string;
          name: string;
          level: string | null;
          element: string | null;
          section: string | null;
        }>;
      }>
    ).map(trial => ({
      id: trial.id,
      name: trial.name,
      date: trial.date,
      plannedStartTime: trial.planned_start_time,
      eventNumber: trial.event_number,
      trialType: trial.trial_type,
      judges: (trial.judge_assignments ?? [])
        .map(ja => ja.people)
        .filter(Boolean)
        .map(p => ({
          id: p!.id,
          firstName: p!.first_name,
          lastName: p!.last_name,
        })),
      classes: (trial.classes ?? []).map(cls => ({
        id: cls.id,
        name: cls.name,
        level: cls.level,
        element: cls.element,
        section: cls.section,
      })),
    }));

    const clubData = show.clubs as { name: string; logo_url: string | null } | null;

    const result = {
      org: show.organization ?? 'AKC',
      style: template?.style ?? 'classic',
      templateId: template?.id ?? null,
      show: {
        id: show.id,
        name: show.name,
        startDate: show.start_date,
        endDate: show.end_date,
        location: show.location,
        entryOpenDate: show.entry_open_date,
        entryCloseDate: show.entry_close_date,
        preEntryFee: show.pre_entry_fee,
        dayOfShowFee: show.day_of_show_fee,
        acceptCheckPayments: show.accept_check_payments,
        acceptCashPayments: show.accept_cash_payments,
      },
      club: {
        id: show.club_id,
        name: clubData?.name ?? null,
        logoUrl: clubData?.logo_url ?? null,
      },
      // Secretary info is stored as free-text on shows.secretary and shows.secretary_email.
      // There is no separate secretary_person_id FK — return what we have.
      secretary: {
        name: show.secretary ?? null,
        email: show.secretary_email ?? null,
        address: null,
        phone: null,
      },
      officials: {
        // Judges are collected per-trial above; top-level is a convenience roll-up
        judges: trials
          .flatMap(t => t.judges)
          .filter((j, idx, arr) => arr.findIndex(x => x.id === j.id) === idx),
      },
      trials,
      supplemental: {
        vetClinicName: template?.vet_clinic_name ?? null,
        vetClinicAddress: template?.vet_clinic_address ?? null,
        vetClinicPhone: template?.vet_clinic_phone ?? null,
        accommodations: template?.accommodations ?? [],
        hospitalityNotes: template?.hospitality_notes ?? null,
        awardsDescription: template?.awards_description ?? null,
        additionalNotes: template?.additional_notes ?? null,
      },
      narratives,
    };

    return jsonResponse(result as unknown as Record<string, unknown>, 200);
  } catch (err) {
    console.error('generate-premium unhandled error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildShowSummary(show: Record<string, unknown>): string {
  const trials =
    (show.trials as Array<{
      name: string;
      date: string;
      trial_type: string | null;
      classes: Array<{ name: string; level: string | null; element: string | null }>;
    }>) ?? [];

  const trialLines = trials.map(t => {
    const classNames = (t.classes ?? [])
      .map(c => [c.level, c.element, c.name].filter(Boolean).join(' '))
      .join(', ');
    return `  - ${t.name} (${t.date}): ${t.trial_type ?? 'unknown type'} — classes: ${classNames || 'none'}`;
  });

  return [
    `Show: ${show.name}`,
    `Organization: ${show.organization ?? 'AKC'}`,
    `Dates: ${show.start_date} to ${show.end_date}`,
    `Location: ${show.location ?? 'TBD'}`,
    `Entry opens: ${show.entry_open_date ?? 'TBD'}, closes: ${show.entry_close_date ?? 'TBD'}`,
    `Pre-entry fee: $${show.pre_entry_fee ?? 'TBD'}, day-of fee: $${show.day_of_show_fee ?? 'TBD'}`,
    `Payment: checks=${show.accept_check_payments}, cash=${show.accept_cash_payments}`,
    `Trials:\n${trialLines.join('\n')}`,
  ].join('\n');
}

async function generateNarratives(
  showSummary: string,
  apiKey: string
): Promise<{ showHours: string; trialInformation: string }> {
  const systemPrompt =
    'You are an expert dog show premium list writer. Given show data, generate concise, professional narrative sections suitable for an AKC-style premium list. Return ONLY valid JSON.';

  const userMessage = `Based on this show data, write two narrative sections for a premium list.

${showSummary}

Return exactly this JSON shape (no markdown, no extra keys):
{
  "showHours": "<2-4 sentences describing typical show hours and check-in times, acknowledging details are subject to judge assignment>",
  "trialInformation": "<3-5 sentences covering the trial format, classes offered, and any relevant competition notes>"
}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const text = data.content?.find((b: { type: string }) => b.type === 'text')?.text ?? '{}';

  const parsed = JSON.parse(text);
  return {
    showHours: typeof parsed.showHours === 'string' ? parsed.showHours : '',
    trialInformation: typeof parsed.trialInformation === 'string' ? parsed.trialInformation : '',
  };
}
