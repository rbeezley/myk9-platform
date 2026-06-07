/**
 * PresenceStack — Phase 1 of docs/plan-show-presence.md.
 *
 * An overlapping avatar cluster showing who is currently present in a show.
 * Renders nothing when no one is present. Reuses the shared Avatar primitive.
 */

import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { ShowPresence } from './types';
import { presenceInitials } from './presenceFormat';

export interface PresenceStackProps {
  present: ShowPresence[];
  /** Max avatars before collapsing into a "+N" chip. */
  max?: number;
  className?: string;
}

export function PresenceStack({ present, max = 4, className }: PresenceStackProps) {
  if (present.length === 0) return null;

  const shown = present.slice(0, max);
  const overflow = present.length - shown.length;
  const label = `${present.length} ${present.length === 1 ? 'person' : 'people'} here`;

  return (
    <div className={cn('flex items-center', className)} aria-label={label}>
      <div className="flex -space-x-2">
        {shown.map(p => (
          <span
            key={p.userId}
            title={p.role ? `${p.name} · ${p.role}` : p.name}
            className="inline-block rounded-full ring-2 ring-background"
          >
            <Avatar className="h-7 w-7">
              {p.avatarUrl && <AvatarImage src={p.avatarUrl} alt={p.name} />}
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                {presenceInitials(p.name)}
              </AvatarFallback>
            </Avatar>
          </span>
        ))}
        {overflow > 0 && (
          <span
            title={`${overflow} more`}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs font-medium ring-2 ring-background"
          >
            +{overflow}
          </span>
        )}
      </div>
    </div>
  );
}
