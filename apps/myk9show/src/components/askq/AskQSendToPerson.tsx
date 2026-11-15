import { Button } from '@/components/ui/button';

/**
 * The way to a person when AskQ cannot answer (outage, no signal, daily limit). It opens the
 * existing ticket step with the typed question as the note and never calls AskQ, so it works
 * with no questions left.
 */
export function AskQSendToPerson({ onSend }: { onSend: () => void }) {
  return (
    // A primary way out, not a compact control: 44px on every width (docs/INTENT.md).
    <Button type="button" variant="outline" className="min-h-[44px]" onClick={onSend}>
      Send this to a person
    </Button>
  );
}
