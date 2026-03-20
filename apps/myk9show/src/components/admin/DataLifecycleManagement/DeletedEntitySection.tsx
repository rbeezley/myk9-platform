/**
 * Collapsible section for a single entity type in the trash view.
 * Lazily loads full records on first expand.
 */

import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronRight, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { formatRelativeTime } from '@/lib/timeUtils';
import type { DeletedEntity, EntitySectionConfig, EntityType } from './types';
import { cn } from '@/lib/utils';

interface DeletedEntitySectionProps {
  config: EntitySectionConfig;
  count: number;
  actionVersion: number;
  isActionLoading: boolean;
  onRestore: (entityId: string, entityName: string, entityType: EntityType) => void;
  onDelete: (entityId: string, entityName: string, entityType: EntityType) => void;
}

export function DeletedEntitySection({
  config,
  count,
  actionVersion,
  isActionLoading,
  onRestore,
  onDelete,
}: DeletedEntitySectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<DeletedEntity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  const Icon = config.icon;
  const { fetchDeleted } = config;

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchDeleted();
      setItems(data);
      setHasFetched(true);
    } finally {
      setIsLoading(false);
    }
  }, [fetchDeleted]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      if (open && !hasFetched) {
        loadItems();
      }
    },
    [hasFetched, loadItems]
  );

  // Re-fetch items when the parent signals an action completed
  useEffect(() => {
    if (actionVersion > 0 && hasFetched) {
      loadItems();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionVersion]);

  if (count === 0 && !isOpen) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={handleOpenChange}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-muted/50 transition-colors text-left">
          <ChevronRight
            className={cn('h-4 w-4 text-muted-foreground transition-transform', isOpen && 'rotate-90')}
          />
          <Icon className={cn('h-5 w-5', config.iconColor)} />
          <span className="font-medium">{config.label}</span>
          <Badge variant="secondary" className="ml-auto">
            {count}
          </Badge>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-12 space-y-2 pb-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-2">Loading...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No deleted {config.label.toLowerCase()} found.</p>
          ) : (
            <>
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {item.context && (
                        <>
                          <span>{item.context}</span>
                          <span>·</span>
                        </>
                      )}
                      <span>
                        Deleted{' '}
                        {item.deleted_at
                          ? formatRelativeTime(new Date(item.deleted_at))
                          : 'Unknown'}
                      </span>
                      {item.deleted_by_email && (
                        <>
                          <span>by</span>
                          <span>{item.deleted_by_email}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 ml-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="!border-green-200/20 !bg-green-50/10 hover:!bg-green-50/20 !text-green-700 hover:!text-green-800"
                      onClick={() => onRestore(item.id, item.name, config.type)}
                      disabled={isActionLoading}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Restore
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="!border-red-200/20 !bg-red-50/10 hover:!bg-red-50/20 !text-red-700 hover:!text-red-800"
                      onClick={() => onDelete(item.id, item.name, config.type)}
                      disabled={isActionLoading}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                size="sm"
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={() => loadItems()}
                disabled={isLoading}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Refresh
              </Button>
            </>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
