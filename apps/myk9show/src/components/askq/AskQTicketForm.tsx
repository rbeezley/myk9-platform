import type { FormEvent } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** The ticket step. The note is uncontrolled and keyed on the question, so a failed send keeps it. */
export function AskQTicketForm({
  question,
  submitting,
  onSubmit,
}: {
  question: string;
  submitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <textarea
        key={question}
        name="supportRequest"
        defaultValue={question}
        rows={3}
        className="w-full resize-none rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label="Support request"
      />
      <Button type="submit" className="w-full gap-2" disabled={submitting}>
        <Send className="h-4 w-4" />
        {submitting ? 'Creating ticket...' : 'Create ticket'}
      </Button>
    </form>
  );
}
