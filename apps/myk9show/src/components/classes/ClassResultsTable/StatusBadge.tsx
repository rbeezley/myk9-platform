/**
 * StatusBadge - Displays entry validation status with tooltip for edit history
 */

import React from 'react';
import { AlertCircle, CheckCircle, History } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip/tooltip';
import type { BulkEntryData } from './types';

interface StatusBadgeProps {
  item: BulkEntryData;
  validationError: string | undefined;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  item,
  validationError,
}) => {
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex items-center gap-2">
            {item.hasChanges ? (
              item.isValid ? (
                <Badge
                  variant="default"
                  className="flex items-center space-x-1"
                >
                  <CheckCircle className="h-3 w-3" />
                  <span>Valid</span>
                </Badge>
              ) : (
                <Badge
                  variant="destructive"
                  className="flex items-center space-x-1"
                >
                  <AlertCircle className="h-3 w-3" />
                  <span>Invalid</span>
                </Badge>
              )
            ) : (
              <Badge
                variant="outline"
                className="flex items-center space-x-1"
              >
                {item.searchTime && item.qualification ? (
                  <>
                    <span>Complete</span>
                    {item.lastEditedBy && (
                      <History className="h-3 w-3 ml-1 text-muted-foreground" />
                    )}
                  </>
                ) : (
                  <span>Empty</span>
                )}
              </Badge>
            )}
          </div>
        </TooltipTrigger>
        {item.lastEditedBy && (
          <TooltipContent>
            <div className="text-xs">
              <div className="font-medium">
                Last edited by: {item.lastEditedBy}
              </div>
              {item.lastEditedAt && (
                <div className="text-muted-foreground">
                  {new Date(item.lastEditedAt).toLocaleDateString()} at{' '}
                  {new Date(item.lastEditedAt).toLocaleTimeString()}
                </div>
              )}
            </div>
          </TooltipContent>
        )}
      </Tooltip>
      {validationError && (
        <div className="text-xs text-red-600 mt-1">{validationError}</div>
      )}
    </>
  );
};
