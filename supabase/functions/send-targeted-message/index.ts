import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { handle } from '../_shared/http/handler.ts';
import { MYK9SHOW_ORIGINS } from '../_shared/http/cors.ts';
import { HttpError } from '../_shared/http/responses.ts';

interface SendTargetedMessagePayload {
  show_id?: string;
  class_id?: string;
  body?: string;
}

handle<SendTargetedMessagePayload>(
  { auth: 'jwt', origins: MYK9SHOW_ORIGINS },
  async ({ body: payload, user, supabase }) => {
    if (!user) {
      throw new HttpError(401, 'Unauthorized');
    }

    const { show_id, class_id, body } = payload;

    if (!show_id || !class_id || !body?.trim()) {
      throw new HttpError(400, 'Missing required fields: show_id, class_id, body');
    }

    // Verify caller is secretary/admin for this show
    const { data: show } = await supabase
      .from('shows')
      .select('id, club_id')
      .eq('id', show_id)
      .single();

    if (!show) {
      throw new HttpError(404, 'Show not found');
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
      throw new HttpError(403, 'Forbidden: secretary or admin role required');
    }

    // Validate class belongs to this show
    const { data: classCheck } = await supabase
      .from('classes')
      .select('id, trials!inner(show_id)')
      .eq('id', class_id)
      .eq('trials.show_id', show_id)
      .single();

    if (!classCheck) {
      throw new HttpError(400, 'Class does not belong to this show');
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
      return { error: 'No entries found for class', sent_to: 0 };
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
      return { sent_to: 0 };
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
      throw new HttpError(500, 'Failed to create threads');
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

    return {
      sent_to: sentCount,
      total_recipients: recipientIds.length,
      group_label: classLabel,
    };
  },
);
