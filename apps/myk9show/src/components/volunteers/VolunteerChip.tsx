import { X, AlertTriangle } from 'lucide-react';
import { formatVolunteerDisplayName } from '@/types/volunteer';
import { cn } from '@/lib/utils';

interface VolunteerChipProps {
  name: string;
  hasConflict?: boolean;
  onRemove: () => void;
}

export function VolunteerChip({ name, hasConflict = false, onRemove }: VolunteerChipProps) {
  return (
    <span
      data-testid="volunteer-chip"
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        hasConflict ? 'bg-warning/10 text-warning ' : 'bg-muted text-muted-foreground'
      )}
    >
      {hasConflict && (
        <span title="Conflict: volunteer is entered in this class">
          <AlertTriangle className="h-3 w-3" />
        </span>
      )}
      {formatVolunteerDisplayName(name)}
      <button
        type="button"
        aria-label={`Remove ${name}`}
        onClick={onRemove}
        className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
