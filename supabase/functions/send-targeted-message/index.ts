import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Authenticate the caller
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify caller identity with their JWT
    const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await callerClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { show_id, class_id, body } = await req.json();

    if (!show_id || !class_id || !body?.trim()) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: show_id, class_id, body' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Use service role client for data operations (bypasses RLS)
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is secretary/admin for this show
    const { data: show } = await supabase
      .from('shows')
      .select('id, club_id')
      .eq('id', show_id)
      .single();

    if (!show) {
      return new Response(JSON.stringify({ error: 'Show not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check caller has secretary or admin role
    const { data: callerRoles } = await supabase
      .from('user_roles')
      .select('id, club_id, people!inner(auth_user_id), roles!inner(name)')
      .eq('people.auth_user_id', user.id)
      .or(
        `and(roles.name.in.(secretary,trial_secretary),club_id.eq.${show.club_id}),roles.name.eq.platform_admin`
      );

    if (!callerRoles || callerRoles.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: secretary or admin role required' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Validate class belongs to this show
    const { data: classCheck } = await supabase
      .from('classes')
      .select('id, trials!inner(show_id)')
      .eq('id', class_id)
      .eq('trials.show_id', show_id)
      .single();

    if (!classCheck) {
      return new Response(JSON.stringify({ error: 'Class does not belong to this show' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get class info for group label
    const { data: classInfo } = await supabase
      .from('classes')
      .select('class_number, name')
      .eq('id', class_id)
      .single();

    // Get all exhibitors in this class via entries -> dogs -> people -> auth_user_id
    const { data: entries } = await supabase
      .from('entries')
      .select('dog:dogs(owner:people(auth_user_id))')
      .eq('class_id', class_id)
      .is('deleted_at', null);

    if (!entries || entries.length === 0) {
      return new Response(JSON.stringify({ error: 'No entries found for class', sent_to: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract unique auth_user_ids, exclude the sender
    const recipientIds = [
      ...new Set(
        entries
          .map((e: any) => e.dog?.owner?.auth_user_id)
          .filter((uid: string | null) => uid && uid !== user.id)
      ),
    ] as string[];

    if (recipientIds.length === 0) {
      return new Response(JSON.stringify({ sent_to: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const classLabel = classInfo
      ? `Sent to all Class ${classInfo.class_number} (${classInfo.name}) exhibitors`
      : `Sent to all class exhibitors`;

    // Batch upsert threads, then batch insert messages (avoids N+1)
    const now = new Date().toISOString();

    // Step 1: Batch upsert all threads
    const threadUpserts = recipientIds.map(recipientId => ({
      show_id,
      participant_id: recipientId,
      last_message_at: now,
    }));

    const { data: upsertedThreads, error: upsertError } = await supabase
      .from('show_message_threads')
      .upsert(threadUpserts, { onConflict: 'show_id,participant_id' })
      .select('id, participant_id');

    if (upsertError || !upsertedThreads) {
      return new Response(
        JSON.stringify({ error: 'Failed to create threads', details: upsertError?.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Batch insert messages into all threads
    const messageInserts = upsertedThreads.map(thread => ({
      show_id,
      thread_id: thread.id,
      sender_id: user.id,
      body: body.trim(),
      group_label: classLabel,
    }));

    const { data: insertedMessages, error: insertError } = await supabase
      .from('show_messages')
      .insert(messageInserts)
      .select('id');

    const sentCount = insertError ? 0 : (insertedMessages?.length ?? 0);

    return new Response(
      JSON.stringify({
        sent_to: sentCount,
        total_recipients: recipientIds.length,
        group_label: classLabel,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
