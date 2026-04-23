import { Link } from 'react-router-dom';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { PageEntry } from '../types';

export interface PageDirectoryRowProps {
  entry: PageEntry;
  /** Pre-resolved navigation path. `null` means unresolvable (disables the button). */
  resolvedPath: string | null;
  /** True while example ids are still being fetched. */
  loading: boolean;
}

function classificationVariant(
  c: PageEntry['classification']
): 'default' | 'secondary' | 'outline' {
  if (c === 'critical-path') return 'default';
  if (c === 'park') return 'secondary';
  return 'outline';
}

export function PageDirectoryRow({ entry, resolvedPath, loading }: PageDirectoryRowProps) {
  const disabled = loading || resolvedPath === null;
  const disabledReason = loading
    ? 'Resolving example id…'
    : resolvedPath === null
      ? 'No example record available for this route'
      : '';

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-medium">{entry.title}</h4>
          <Badge variant={classificationVariant(entry.classification)}>
            {entry.classification}
          </Badge>
          <Badge variant="outline">{entry.category}</Badge>
          <Badge variant="outline">{entry.status}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{entry.description}</p>
        <code className="mt-1 block text-xs text-muted-foreground">{entry.path}</code>
      </div>
      <div className="shrink-0">
        {disabled ? (
          <Button variant="outline" size="sm" disabled title={disabledReason}>
            {loading ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="mr-1 h-4 w-4" />
            )}
            Go to page
          </Button>
        ) : (
          <Button asChild variant="outline" size="sm">
            <Link to={resolvedPath}>
              <ArrowRight className="mr-1 h-4 w-4" />
              Go to page
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
