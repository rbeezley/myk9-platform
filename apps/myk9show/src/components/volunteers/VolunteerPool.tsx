import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatVolunteerDisplayName } from '@/types/volunteer';
import type { Volunteer } from '@/types/volunteer';

interface VolunteerPoolProps {
  volunteers: Volunteer[];
  onAddClick: () => void;
  onEditClick: (volunteer: Volunteer) => void;
}

export function VolunteerPool({ volunteers, onAddClick, onEditClick }: VolunteerPoolProps) {
  const count = volunteers.length;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
      <Badge variant="secondary" className="shrink-0">
        {count} {count === 1 ? 'volunteer' : 'volunteers'}
      </Badge>

      {volunteers.map(vol => (
        <button
          key={vol.id}
          type="button"
          onClick={() => onEditClick(vol)}
          className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted/80 transition-colors"
        >
          {formatVolunteerDisplayName(vol.name)}
          {!vol.personId && <span className="text-muted-foreground/60">(walk-up)</span>}
        </button>
      ))}

      <Button variant="outline" size="sm" onClick={onAddClick} className="shrink-0">
        <UserPlus className="mr-1 h-3.5 w-3.5" />
        Add Volunteer
      </Button>
    </div>
  );
}
