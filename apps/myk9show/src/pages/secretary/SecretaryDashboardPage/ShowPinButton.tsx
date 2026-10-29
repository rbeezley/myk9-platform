import { Pin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ShowPin {
  pinned: boolean;
  onToggle: () => void;
}

/**
 * Pins this show as the rail's current show, the one manual override of the automatic pick
 * (MYK9-1490). One slot: pinning another replaces it; pressing it again unpins, and the rail
 * returns to the automatic pick.
 *
 * The visible word carries the state ("Pin" / "Pinned"), so the name says what a press does
 * rather than adding aria-pressed, which would announce the state twice.
 */
export function ShowPinButton({ showName, pin }: { showName: string; pin: ShowPin }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="touch"
      onClick={pin.onToggle}
      // Starts with the visible word (WCAG 2.5.3, label in name).
      aria-label={
        pin.pinned
          ? `Pinned: ${showName} is your current show. Unpin`
          : `Pin ${showName} as your current show`
      }
      className={cn('shrink-0 gap-1.5', pin.pinned ? 'text-primary' : 'text-muted-foreground')}
    >
      <Pin className={cn('h-4 w-4', pin.pinned && 'fill-current')} aria-hidden="true" />
      <span>{pin.pinned ? 'Pinned' : 'Pin'}</span>
    </Button>
  );
}
