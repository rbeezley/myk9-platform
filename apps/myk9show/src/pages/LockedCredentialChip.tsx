import React from 'react';
import { Pencil } from 'lucide-react';

interface LockedCredentialChipProps {
  value: string;
  onEdit: () => void;
}

/**
 * The committed credential, shown back with an edit affordance once the front
 * door has branched (password or passcode step).
 *
 * INTENT: no hunting — the value you typed stays on screen, and getting back to
 * it is one obvious tap rather than a browser Back guess.
 */
export const LockedCredentialChip: React.FC<LockedCredentialChipProps> = ({ value, onEdit }) => (
  <div className="flex items-center justify-between mb-4 p-2 pl-3 border border-input rounded-md bg-background">
    <span className="text-foreground truncate" data-testid="locked-credential">
      {value}
    </span>
    <button
      type="button"
      onClick={onEdit}
      className="flex min-h-11 items-center gap-1 rounded px-2 text-sm text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <Pencil size={14} /> Edit
    </button>
  </div>
);
