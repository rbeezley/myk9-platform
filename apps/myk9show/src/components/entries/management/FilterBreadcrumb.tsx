import { ChevronRight } from 'lucide-react';

interface FilterBreadcrumbProps {
  trialName: string | null;
  className: string | null;
  onClearTrial: () => void;
  onClearClass: () => void;
}

export function FilterBreadcrumb({
  trialName,
  className,
  onClearTrial,
  onClearClass,
}: FilterBreadcrumbProps) {
  if (!trialName && !className) {
    return null;
  }

  return (
    <nav className="flex items-center gap-1.5 px-4 py-2" aria-label="Filter breadcrumb">
      <span
        className="text-sm text-muted-foreground hover:text-foreground cursor-pointer"
        onClick={onClearTrial}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onClearTrial();
        }}
      >
        All Entries
      </span>

      {trialName && (
        <>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          {className ? (
            <span
              className="text-sm text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={onClearClass}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onClearClass();
              }}
            >
              {trialName}
            </span>
          ) : (
            <span className="text-sm text-foreground font-medium">{trialName}</span>
          )}
        </>
      )}

      {className && (
        <>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-foreground font-medium">{className}</span>
        </>
      )}
    </nav>
  );
}
