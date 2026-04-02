/**
 * ViewPicker — Dropdown to save, load, and manage named view configurations.
 *
 * Placed in the toolbar of browse pages alongside view mode toggles.
 */

import { useState, useCallback } from 'react';
import { Bookmark, ChevronDown, Plus, Star, Trash2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { SavedView, ViewConfig } from '@/hooks/useSavedViews';

interface ViewPickerProps {
  views: SavedView[];
  activeViewId: string | null;
  /** Returns the current page state as a ViewConfig. */
  getCurrentConfig: () => ViewConfig;
  onApply: (id: string) => void;
  onSave: (name: string, config: ViewConfig) => void;
  onUpdate: (id: string, config: ViewConfig) => void;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
  onClear: () => void;
}

export function ViewPicker({
  views,
  activeViewId,
  getCurrentConfig,
  onApply,
  onSave,
  onUpdate,
  onDelete,
  onSetDefault,
  onClear,
}: ViewPickerProps) {
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [newViewName, setNewViewName] = useState('');

  const activeView = views.find(v => v.id === activeViewId);

  const handleSave = useCallback(() => {
    const name = newViewName.trim();
    if (!name) return;
    onSave(name, getCurrentConfig());
    setNewViewName('');
    setIsSaveDialogOpen(false);
  }, [newViewName, getCurrentConfig, onSave]);

  const handleUpdateCurrent = useCallback(() => {
    if (activeViewId) {
      onUpdate(activeViewId, getCurrentConfig());
    }
  }, [activeViewId, getCurrentConfig, onUpdate]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Bookmark className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{activeView ? activeView.name : 'Saved Views'}</span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {views.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              No saved views yet
            </div>
          )}
          {views.map(view => (
            <DropdownMenuItem
              key={view.id}
              onClick={() => onApply(view.id)}
              className={cn(
                'flex items-center justify-between',
                view.id === activeViewId && 'bg-primary/10 text-primary'
              )}
            >
              <span className="flex items-center gap-2 truncate">
                {view.isDefault && <Star className="h-3 w-3 text-yellow-500 flex-shrink-0" />}
                <span className="truncate">{view.name}</span>
              </span>
              <span className="flex items-center gap-1 flex-shrink-0 ml-2">
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    onSetDefault(view.id);
                  }}
                  className="p-0.5 hover:text-yellow-500 transition-colors"
                  aria-label={`Set ${view.name} as default`}
                >
                  <Star className={cn('h-3 w-3', view.isDefault && 'fill-yellow-500')} />
                </button>
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    onDelete(view.id);
                  }}
                  className="p-0.5 hover:text-destructive transition-colors"
                  aria-label={`Delete ${view.name}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            </DropdownMenuItem>
          ))}

          {views.length > 0 && <DropdownMenuSeparator />}

          {activeViewId && (
            <DropdownMenuItem onClick={handleUpdateCurrent}>
              <Save className="h-3.5 w-3.5 mr-2" />
              Update &ldquo;{activeView?.name}&rdquo;
            </DropdownMenuItem>
          )}

          <DropdownMenuItem onClick={() => setIsSaveDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-2" />
            Save current view
          </DropdownMenuItem>

          {activeViewId && <DropdownMenuItem onClick={onClear}>Clear active view</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Save dialog */}
      <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save View</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="View name (e.g., Upcoming Shows)"
            value={newViewName}
            onChange={e => setNewViewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSave();
            }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!newViewName.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
