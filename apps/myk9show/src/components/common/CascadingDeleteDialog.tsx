import React, { useState } from 'react';
import { CommonDialog } from './CommonDialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Calendar, Trophy, Users, Trash2 } from 'lucide-react';
import { CascadingDeletePreview } from '@/utils/cascadingDelete';
import { format, parseISO } from 'date-fns';

const ELEMENT_ORDER = ['interior', 'exterior', 'container', 'buried'];
const LEVEL_ORDER = ['novice', 'advanced', 'excellent', 'master'];
const SECTION_ORDER = ['a', 'b', 'c', 'd'];

function sortClasses(classes: Array<{ id: string; name: string; trialName: string }>) {
  return [...classes].sort((a, b) => {
    // Sort by trial number first
    const trialNumA = parseInt(a.trialName.match(/\d+/)?.[0] || '0', 10);
    const trialNumB = parseInt(b.trialName.match(/\d+/)?.[0] || '0', 10);
    if (trialNumA !== trialNumB) return trialNumA - trialNumB;

    const nameA = a.name.toLowerCase();
    const nameB = b.name.toLowerCase();

    // Sort by element
    const elemA = ELEMENT_ORDER.findIndex(e => nameA.includes(e));
    const elemB = ELEMENT_ORDER.findIndex(e => nameB.includes(e));
    if (elemA !== elemB) return (elemA === -1 ? 99 : elemA) - (elemB === -1 ? 99 : elemB);

    // Sort by level
    const lvlA = LEVEL_ORDER.findIndex(l => nameA.includes(l));
    const lvlB = LEVEL_ORDER.findIndex(l => nameB.includes(l));
    if (lvlA !== lvlB) return (lvlA === -1 ? 99 : lvlA) - (lvlB === -1 ? 99 : lvlB);

    // Sort by section (last character if A/B/C/D)
    const secA = SECTION_ORDER.indexOf(nameA.trim().slice(-1));
    const secB = SECTION_ORDER.indexOf(nameB.trim().slice(-1));
    return (secA === -1 ? 99 : secA) - (secB === -1 ? 99 : secB);
  });
}

interface CascadingDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: CascadingDeletePreview | null;
  onConfirm: (permanent?: boolean) => void;
  entityType?: string;
  titleIcon?: React.ReactNode;
  isDeleting?: boolean;
  /** Show permanent delete option (site admin only) */
  allowPermanentDelete?: boolean;
}

export function CascadingDeleteDialog({
  open,
  onOpenChange,
  preview,
  onConfirm,
  entityType = 'show',
  titleIcon,
  isDeleting = false,
  allowPermanentDelete = false,
}: CascadingDeleteDialogProps) {
  const [permanent, setPermanent] = useState(false);

  // Don't render anything if not open or no preview
  if (!open || !preview) {
    return null;
  }

  const hasRelatedData = preview.totalToDelete > 0;
  const defaultTitleIcon = titleIcon || <Trash2 className="w-5 h-5" />;

  return (
    <CommonDialog
      open={open}
      onClose={() => onOpenChange(false)}
      title={`Delete ${entityType}: ${preview.showName}`}
      titleIcon={defaultTitleIcon}
      maxWidth="max-w-2xl"
      footer={
        <div className="space-y-3">
          {allowPermanentDelete && (
            <div className="flex items-center gap-2 px-1">
              <Checkbox
                id="permanent-delete"
                checked={permanent}
                onCheckedChange={checked => setPermanent(checked === true)}
              />
              <Label htmlFor="permanent-delete" className="text-sm text-destructive cursor-pointer">
                Permanently delete (cannot be restored)
              </Label>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => onConfirm(permanent)}
              disabled={isDeleting}
              className="min-w-24"
            >
              {isDeleting
                ? 'Deleting...'
                : permanent
                  ? `Permanently Delete`
                  : `Delete ${entityType.charAt(0).toUpperCase() + entityType.slice(1)}`}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3 -mt-2">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <span className="font-medium text-foreground">Delete Confirmation</span>
        </div>
        {!hasRelatedData ? (
          <div className="text-sm text-muted-foreground">
            This {entityType} has no related data and can be safely deleted.
          </div>
        ) : (
          <>
            <div className="bg-destructive/10 border border-destructive/30 rounded-xl px-3 py-1">
              <div className="flex items-center gap-2 text-destructive font-medium leading-none m-0">
                <AlertTriangle className="h-4 w-4" />
                Warning: This will permanently delete all related data
              </div>
              <div className="text-sm text-destructive leading-tight m-0">
                Deleting this {entityType} will also permanently delete {preview.totalToDelete}{' '}
                related records. This action cannot be undone.
              </div>
            </div>

            <div className="space-y-2">
              {preview.trialsToDelete.length > 0 && (
                <div className="bg-info/10 rounded-xl px-3 py-1">
                  <div className="flex items-center gap-2 font-medium text-sm text-info leading-none m-0">
                    <Calendar className="h-4 w-4" />
                    Trials ({preview.trialsToDelete.length})
                  </div>
                  <div className="ml-6">
                    {[...preview.trialsToDelete]
                      .sort((a, b) => {
                        const numA = parseInt(a.name.match(/\d+/)?.[0] || '0', 10);
                        const numB = parseInt(b.name.match(/\d+/)?.[0] || '0', 10);
                        if (numA !== numB) return numA - numB;
                        return a.date.localeCompare(b.date);
                      })
                      .map(trial => (
                        <div key={trial.id} className="text-xs text-info leading-none m-0">
                          • {trial.name} - {format(parseISO(trial.date), 'MM/dd/yyyy')}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {preview.classesToDelete.length > 0 && (
                <div className="bg-success/10 rounded-xl px-3 py-1">
                  <div className="flex items-center gap-2 font-medium text-sm text-success leading-none m-0">
                    <Trophy className="h-4 w-4" />
                    Classes ({preview.classesToDelete.length})
                  </div>
                  <div className="ml-6">
                    {sortClasses(preview.classesToDelete).map(cls => (
                      <div key={cls.id} className="text-xs text-success leading-none m-0">
                        • {cls.trialName} - {cls.name}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {preview.entriesToDelete.length > 0 && (
                <div className="bg-purple-50 dark:bg-purple-950/20 rounded-xl px-3 py-1">
                  <div className="flex items-center gap-2 font-medium text-sm text-purple-700 dark:text-purple-300 leading-none m-0">
                    <Users className="h-4 w-4" />
                    Entries ({preview.entriesToDelete.length})
                  </div>
                  <div className="ml-6">
                    {preview.entriesToDelete.map(entry => (
                      <div
                        key={entry.id}
                        className="text-xs text-purple-600 dark:text-purple-400 leading-none m-0"
                      >
                        • {entry.dogName} in {entry.className}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl px-3 py-1">
              <div className="text-sm font-medium text-foreground leading-none m-0">
                Total records to be deleted: {preview.totalToDelete + 1}
              </div>
              <div className="text-xs text-muted-foreground leading-none m-0">
                1 {entityType} + {preview.trialsToDelete.length} trials +{' '}
                {preview.classesToDelete.length} classes + {preview.entriesToDelete.length} entries
              </div>
            </div>
          </>
        )}
      </div>
    </CommonDialog>
  );
}
