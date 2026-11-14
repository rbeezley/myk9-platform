import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatShortDate } from '@/lib/format/dates';
import type { SupportTicket } from '../support/supportTickets';
import { useSupportTicketMessages } from '../support/useSupportTickets';
import type { MockNoteTarget } from './mockShowTickets';
import { useSaveMockNote } from './useMockShowTest';

interface MockNoteBoxProps {
  target: MockNoteTarget;
  /** The tester's ticket for this task or question, once she has sent one. */
  ticket: SupportTicket | null;
  label: string;
  placeholder?: string;
  id: string;
}

/** A notes box that saves to the Support Inbox, with the notes already sent under it. */
export function MockNoteBox({ target, ticket, label, placeholder, id }: MockNoteBoxProps) {
  const [draft, setDraft] = useState('');
  const save = useSaveMockNote();
  const messages = useSupportTicketMessages(ticket?.id ?? null);
  const sent = messages.data ?? [];

  const submit = () => {
    const body = draft.trim();
    if (!body || save.isPending) return;
    save.mutate(
      { target, body },
      {
        onSuccess: () => {
          setDraft('');
          toast.success('Note saved. Thank you.');
        },
        onError: () =>
          toast.error('Could not save that note. Your words are still here, so try again.'),
      }
    );
  };

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Textarea
        id={id}
        value={draft}
        onChange={event => setDraft(event.target.value)}
        placeholder={placeholder}
        rows={4}
        maxLength={5000}
        className="text-base"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={submit}
          disabled={!draft.trim() || save.isPending}
          className="min-h-11"
        >
          {save.isPending ? 'Saving...' : sent.length > 0 ? 'Save another note' : 'Save note'}
        </Button>
        {save.isError && (
          <p role="alert" className="text-sm text-destructive">
            Could not save. Check your connection and try again.
          </p>
        )}
      </div>

      {sent.length > 0 && (
        <details className="rounded-md border border-border bg-muted/40 p-3 text-sm">
          <summary className="min-h-11 cursor-pointer py-2 font-medium">
            Notes you have sent ({sent.length})
          </summary>
          <ul className="mt-2 space-y-3">
            {sent.map(message => (
              <li key={message.id}>
                <p className="text-xs text-muted-foreground">
                  {message.isFromOperator ? 'myK9 support' : 'You'} ·{' '}
                  {formatShortDate(message.createdAt)}
                </p>
                <p className="whitespace-pre-wrap">{message.body}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
