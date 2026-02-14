import { Clock, GitBranch, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatValue, formatDate } from '../conflict-resolution-utils';
import type { NormalizedConflict } from '../conflict-resolution-types';

interface LegacyConflictViewProps {
  normalizedConflict: NormalizedConflict;
  selectedFields: Record<string, 'local' | 'remote'>;
  onFieldSelection: (field: string, source: 'local' | 'remote') => void;
}

export function LegacyConflictView({
  normalizedConflict,
  selectedFields,
  onFieldSelection,
}: LegacyConflictViewProps) {
  return (
    <div className="space-y-6 overflow-y-auto max-h-[60vh]">
      {/* Conflict Summary */}
      {normalizedConflict.lastModified && (
        <div className="bg-muted/30 rounded-lg p-4">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <User className="h-4 w-4" />
                Local Changes
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <div className="flex items-center gap-2">
                  <Clock className="h-3 w-3" />
                  Modified: {formatDate(normalizedConflict.lastModified.local)}
                </div>
                {normalizedConflict.lastModifiedBy && (
                  <div>By: {String(normalizedConflict.lastModifiedBy.local)}</div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <GitBranch className="h-4 w-4" />
                Server Changes
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <div className="flex items-center gap-2">
                  <Clock className="h-3 w-3" />
                  Modified: {formatDate(normalizedConflict.lastModified.remote)}
                </div>
                {normalizedConflict.lastModifiedBy && (
                  <div>By: {String(normalizedConflict.lastModifiedBy.remote)}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Field-by-Field Comparison */}
      <div className="space-y-4">
        {normalizedConflict.conflictFields.map((field) => (
          <div key={field} className="border border-border/50 rounded-lg overflow-hidden">
            <div className="bg-muted/20 px-4 py-2 border-b border-border/50">
              <h4 className="font-medium text-sm capitalize">
                {field.replace(/([A-Z])/g, ' $1').trim()}
              </h4>
            </div>

            <div className="grid grid-cols-2 divide-x divide-border/50">
              {/* Local Version */}
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-primary">Local Version</span>
                  <Button
                    variant={selectedFields[field] === 'local' ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => onFieldSelection(field, 'local')}
                  >
                    {selectedFields[field] === 'local' ? 'Selected' : 'Use This'}
                  </Button>
                </div>
                <div className="bg-background/50 rounded-md p-3 text-sm font-mono max-h-24 overflow-auto">
                  {formatValue(normalizedConflict.local[field])}
                </div>
              </div>

              {/* Remote Version */}
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-secondary-purple">Server Version</span>
                  <Button
                    variant={selectedFields[field] === 'remote' ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => onFieldSelection(field, 'remote')}
                  >
                    {selectedFields[field] === 'remote' ? 'Selected' : 'Use This'}
                  </Button>
                </div>
                <div className="bg-background/50 rounded-md p-3 text-sm font-mono max-h-24 overflow-auto">
                  {formatValue(normalizedConflict.remote[field])}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
