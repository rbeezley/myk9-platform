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
 */
export function ShowPinButton({ showName, pin }: { showName: string; pin: ShowPin }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="touch"
      aria-pressed={pin.pinned}
      onClick={pin.onToggle}
      className={cn('shrink-0 gap-1.5', pin.pinned ? 'text-primary' : 'text-muted-foreground')}
    >
      <Pin className={cn('h-4 w-4', pin.pinned && 'fill-current')} aria-hidden="true" />
      <span>{pin.pinned ? 'Pinned' : 'Pin'}</span>
      <span className="sr-only"> {showName} as your current show</span>
    </Button>
  );
}
