import { cn } from '@/lib/utils';

interface MineToggleProps {
  isMine: boolean;
  onToggle: () => void;
  allLabel: string;
  mineLabel: string;
  allCount?: number;
  mineCount?: number;
  hidden?: boolean;
  className?: string;
}

export function MineToggle({
  isMine,
  onToggle,
  allLabel,
  mineLabel,
  allCount,
  mineCount,
  hidden,
  className,
}: MineToggleProps) {
  if (hidden) return null;

  const allText = allCount !== undefined ? `${allLabel} (${allCount})` : allLabel;
  const mineText = mineCount !== undefined ? `${mineLabel} (${mineCount})` : mineLabel;

  return (
    <div className={cn('flex bg-muted/50 rounded-lg p-1 gap-0.5', className)}>
      <button
        className={cn(
          'h-12 rounded-md px-4 text-sm font-medium transition-colors',
          !isMine
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        )}
        onClick={() => isMine && onToggle()}
      >
        {allText}
      </button>
      <button
        className={cn(
          'h-12 rounded-md px-4 text-sm font-medium transition-colors',
          isMine
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        )}
        onClick={() => !isMine && onToggle()}
      >
        {mineText}
      </button>
    </div>
  );
}
