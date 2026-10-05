import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Closes the open record in a master-detail pane by going back to the bare list route. */
export function CloseDetailLink({ to, label }: { to: string; label: string }) {
  return (
    <Button asChild variant="ghost" size="icon" className="min-h-11 min-w-11">
      <Link to={to} aria-label={label}>
        <X className="h-4 w-4" aria-hidden="true" />
      </Link>
    </Button>
  );
}
