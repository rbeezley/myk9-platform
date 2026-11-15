import { Button } from '@/components/ui/button';

/**
 * The way to a person when AskQ cannot answer (outage, no signal, daily limit). It opens the
 * existing ticket step with the typed question as the note and never calls AskQ, so it works
 * with no questions left.
 */
export function AskQSendToPerson({ onSend }: { onSend: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onSend}>
      Send this to a person
    </Button>
  );
}
