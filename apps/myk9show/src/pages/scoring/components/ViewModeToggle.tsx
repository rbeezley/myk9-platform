import type { ReactNode } from 'react';
import { List, PanelTop } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PaperScoringMode } from '../paper-scoring-types';

/** List / Card switch for the paper scoresheet. */
export function ViewModeToggle({
  mode,
  onChange,
}: {
  mode: PaperScoringMode;
  onChange: (mode: PaperScoringMode) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Scoring view"
      className="flex items-center gap-1 rounded-lg border bg-background p-1"
    >
      <ViewModeButton
        active={mode === 'split'}
        icon={<List className="h-4 w-4" />}
        label="List"
        onClick={() => onChange('split')}
      />
      <ViewModeButton
        active={mode === 'sequential'}
        icon={<PanelTop className="h-4 w-4" />}
        label="Card"
        onClick={() => onChange('sequential')}
      />
    </div>
  );
}

function ViewModeButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors',
        active
          ? 'bg-accent text-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
