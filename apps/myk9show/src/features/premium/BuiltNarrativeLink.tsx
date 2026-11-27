import { Button } from '@/components/ui/button';
import { PREMIUM_PENDING_REASON } from './premiumPendingCopy';

export const UNSAVED_SHOW_REASON =
  'Save the show first, then reopen Premium to use its current details.';

interface BuiltNarrativeLinkProps {
  /** What the show's facts build today; absent offline or from an older response. */
  built: string | undefined;
  /** The field's text now. */
  text: string;
  /** Why the link is held, or undefined when it can be used. */
  heldReason: string | undefined;
  onUse: (built: string) => void;
}

/**
 * MYK9-2280: "Use the show's current details" under one narrative. Shown only when it would
 * change the field. It makes no request: the editor already holds the server's built text.
 */
export function BuiltNarrativeLink({ built, text, heldReason, onUse }: BuiltNarrativeLinkProps) {
  if (built === undefined || built.trim() === text.trim()) return null;
  return (
    <div className="space-y-0.5">
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto px-0 py-0 text-xs"
        disabled={Boolean(heldReason)}
        onClick={() => onUse(built)}
      >
        Use the show&apos;s current details
      </Button>
      {heldReason && <p className="text-xs text-muted-foreground">{heldReason}</p>}
    </div>
  );
}

/** The first reason the link is held: a request in flight, a blocked Regenerate, unsaved input. */
export function builtNarrativeHeldReason(options: {
  isGenerating: boolean;
  regenerateBlockedReason: string | undefined;
  unsavedShowInputs: boolean;
}): string | undefined {
  if (options.isGenerating) return PREMIUM_PENDING_REASON;
  if (options.regenerateBlockedReason) return options.regenerateBlockedReason;
  if (options.unsavedShowInputs) return UNSAVED_SHOW_REASON;
  return undefined;
}
