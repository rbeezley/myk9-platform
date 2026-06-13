/**
 * Toolbar for inline editing controls
 */

import React from 'react';
import { Pencil, Save, Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ChangesSummary } from '../types';

interface InlineEditingToolbarProps {
  enableInlineEditing: boolean;
  canEditResults: boolean;
  canBulkEdit: boolean;
  canAccessAdvancedFeatures: boolean;
  hasResultUpdate: boolean;
  autoSaveEnabled: boolean;
  changesSummary: ChangesSummary;
  userRole?: string | undefined;
  onToggleInlineEditing?: (() => void) | undefined;
  onToggleAutoSave: () => void;
}

export const InlineEditingToolbar: React.FC<InlineEditingToolbarProps> = ({
  enableInlineEditing,
  canEditResults,
  canBulkEdit,
  canAccessAdvancedFeatures,
  hasResultUpdate,
  autoSaveEnabled,
  changesSummary,
  userRole,
  onToggleInlineEditing,
  onToggleAutoSave,
}) => {
  return (
    <div className="flex justify-between items-center">
      <div className="flex items-center space-x-3">
        {hasResultUpdate && canEditResults && (
          <>
            <Button
              variant={enableInlineEditing ? 'default' : 'outline'}
              size="sm"
              onClick={onToggleInlineEditing}
              className="myk9-action-button"
              disabled={!canBulkEdit}
            >
              <Pencil className="h-4 w-4 mr-2" />
              {enableInlineEditing ? 'Exit Edit Mode' : 'Enable Inline Editing'}
            </Button>
            {enableInlineEditing && (
              <div className="flex items-center space-x-4">
                <div className="text-sm text-muted-foreground">
                  Click fields to edit • Tab/Enter to navigate • Ctrl+S to save
                </div>
                {canAccessAdvancedFeatures && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onToggleAutoSave}
                    className={cn(
                      'myk9-action-button',
                      autoSaveEnabled && 'bg-success/10 text-success '
                    )}
                  >
                    <Save className="h-4 w-4 mr-1" />
                    Auto-save {autoSaveEnabled ? 'ON' : 'OFF'}
                  </Button>
                )}
              </div>
            )}
          </>
        )}

        {enableInlineEditing && changesSummary.total > 0 && (
          <div className="flex items-center space-x-2 text-sm">
            <Badge variant="outline" className="flex items-center space-x-1">
              <Keyboard className="h-3 w-3" />
              <span>Editing Mode</span>
            </Badge>
            {changesSummary.valid > 0 && (
              <span className="text-green-600">{changesSummary.valid} valid</span>
            )}
            {changesSummary.invalid > 0 && (
              <span className="text-red-600">{changesSummary.invalid} invalid</span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center space-x-2">
        {userRole && (
          <Badge variant="secondary" className="text-xs">
            {userRole.charAt(0).toUpperCase() + userRole.slice(1)}
          </Badge>
        )}
      </div>
    </div>
  );
};
