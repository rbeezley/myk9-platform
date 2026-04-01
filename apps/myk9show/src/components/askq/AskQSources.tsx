// apps/myk9show/src/components/askq/AskQSources.tsx
import { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface AskQSourcesProps {
  sources: Record<string, unknown[]>;
}

const SOURCE_LABELS: Record<string, string> = {
  rules: 'Rules',
  classes: 'Classes',
  entries: 'Entries',
  trials: 'Trials',
  guide: 'Guide',
};

export function AskQSources({ sources }: AskQSourcesProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const sourceEntries = Object.entries(sources).filter(([, items]) => items && items.length > 0);
  const totalCount = sourceEntries.reduce((sum, [, items]) => sum + items.length, 0);

  if (totalCount === 0) return null;

  return (
    <div>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between bg-muted rounded-lg px-3.5 py-2.5 text-sm text-muted-foreground hover:bg-muted/80 transition-colors"
      >
        <span>Sources ({totalCount})</span>
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
      </button>

      {isExpanded && (
        <div className="mt-2 space-y-3 pl-1">
          {sourceEntries.map(([type, items]) => (
            <div key={type}>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                {SOURCE_LABELS[type] ?? type}
              </p>
              <div className="space-y-1">
                {(items as Array<Record<string, unknown>>).map((item, i) => (
                  <SourceItem key={i} type={type} item={item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SourceItem({ type, item }: { type: string; item: Record<string, unknown> }) {
  switch (type) {
    case 'rules':
      return (
        <div className="text-xs bg-background rounded px-2.5 py-2 border">
          <p className="font-medium">{item.title as string}</p>
          {item.section && (
            <p className="text-muted-foreground mt-0.5">Section {item.section as string}</p>
          )}
        </div>
      );
    case 'entries':
      return (
        <div className="text-xs bg-background rounded px-2.5 py-2 border flex items-center justify-between">
          <span className="font-medium">{item.dog_name as string}</span>
          <div className="flex items-center gap-2">
            {item.placement && (
              <span className="text-muted-foreground">#{item.placement as number}</span>
            )}
            {item.qualification_status && (
              <span
                className={
                  item.qualification_status === 'Q'
                    ? 'text-green-600 dark:text-green-400 font-medium'
                    : 'text-muted-foreground'
                }
              >
                {item.qualification_status as string}
              </span>
            )}
          </div>
        </div>
      );
    case 'classes':
      return (
        <div className="text-xs bg-background rounded px-2.5 py-2 border">
          <p className="font-medium">
            {item.element as string} {item.level as string}
          </p>
          <p className="text-muted-foreground">{item.class_status as string}</p>
        </div>
      );
    case 'trials':
      return (
        <div className="text-xs bg-background rounded px-2.5 py-2 border">
          <p className="font-medium">{item.trial_name as string}</p>
          <p className="text-muted-foreground">{item.trial_date as string}</p>
        </div>
      );
    default:
      return (
        <div className="text-xs bg-background rounded px-2.5 py-2 border">
          <p>{JSON.stringify(item)}</p>
        </div>
      );
  }
}
