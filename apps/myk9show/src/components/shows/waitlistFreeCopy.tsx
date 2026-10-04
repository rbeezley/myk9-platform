import { Info } from 'lucide-react';

/**
 * MYK9-1013: joining a wait list is free; payment happens only when a spot is
 * offered and the exhibitor claims it. The promise is "just for joining" — a
 * paid dog that overflowed a cart is charged and refunded, so never promise
 * "never charged" on its own.
 */
export const WAITLIST_FREE_COPY =
  'Joining the waitlist is free. You only pay if a spot opens and you claim it.';

export function WaitlistFreeNote({ className }: { className?: string }) {
  return (
    <p className={`flex items-start gap-1.5 text-xs text-muted-foreground ${className ?? ''}`}>
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{WAITLIST_FREE_COPY}</span>
    </p>
  );
}
