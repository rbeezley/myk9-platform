import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface WebhookPayload {
  type: 'UPDATE';
  table: string;
  record: {
    id: string;
    dog_id: string;
    class_id: string;
    user_id: string;
    scoring_completed_at: string | null;
  };
  old_record: {
    id: string;
    scoring_completed_at: string | null;
  };
}

Deno.serve(async (req: Request) => {
  try {
    const payload: WebhookPayload = await req.json();

    // Only fire when scoring_completed_at transitions from null to a value
    if (
      payload.old_record.scoring_completed_at !== null ||
      payload.record.scoring_completed_at === null
    ) {
      return new Response('No action needed', { status: 200 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Look up dog name and class name for the notification body
    const { data: entry } = await supabase
      .from('entries')
      .select('dog:dogs(call_name), class:classes(name)')
      .eq('id', payload.record.id)
      .single();

    const dogName = entry?.dog?.call_name ?? 'Your dog';
    const className = entry?.class?.name ?? 'a class';

    // Call the send-push-notification function
    await supabase.functions.invoke('send-push-notification', {
      body: {
        user_id: payload.record.user_id,
        payload: {
          type: 'results_posted',
          title: 'Results Posted',
          body: `${dogName} — ${className}`,
          priority: 'normal',
        },
      },
    });

    return new Response('Push sent', { status: 200 });
  } catch (error) {
    console.error('push-trigger-scoring error:', error);
    return new Response('Error', { status: 500 });
  }
});
