/**
 * Self-contained Deleted Entities (Trash) tab.
 * Fetches counts on mount, renders 7 collapsible entity sections,
 * and manages its own restore / hard-delete confirmation dialogs.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Shield, AlertTriangle, Trash2, Loader2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuthContext } from '@/hooks/useAuthContext';
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import {
  ListResultLine,
  ListViewTabs,
  patchSearchParams,
  type ListView,
} from '@/components/list-toolkit';
import { permanentDeleteRefusalMessage } from '@/services/database/permanentDeleteRefusal';

import { DeletedEntitySection } from './DeletedEntitySection';
import {
  ENTITY_LABEL,
  ENTITY_SECTIONS,
  emptyCounts,
  fetchDeletedCounts,
  isEntityType,
} from './deletedEntityConfig';
import type { EntityType, SelectedEntity } from './types';

const ITEM_NOUN = ['deleted item', 'deleted items'] as const;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function DeletedEntitiesTab() {
  const { user } = useAuthContext();

  // Counts per entity type
  const [counts, setCounts] = useState<Record<EntityType, number>>(emptyCounts);
  const [isLoadingCounts, setIsLoadingCounts] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionVersion, setActionVersion] = useState(0);
  const [lastActionType, setLastActionType] = useState<EntityType | null>(null);

  // Confirmation dialog state
  const [restoreTarget, setRestoreTarget] = useState<SelectedEntity | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SelectedEntity | null>(null);

  /* ---- Fetch counts for all 7 entity types in parallel ----------- */

  const fetchCounts = useCallback(async () => {
    setIsLoadingCounts(true);
    try {
      setCounts(await fetchDeletedCounts());
    } catch (_err) {
      logger.error('Failed to fetch deleted entity counts', 'trash');
    } finally {
      setIsLoadingCounts(false);
    }
  }, []);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  /* ---- Dialog handlers ------------------------------------------- */

  const handleShowRestore = useCallback(
    (entityId: string, entityName: string, entityType: EntityType) => {
      setRestoreTarget({ id: entityId, name: entityName, type: entityType });
    },
    []
  );

  const handleShowDelete = useCallback(
    (entityId: string, entityName: string, entityType: EntityType) => {
      setDeleteTarget({ id: entityId, name: entityName, type: entityType });
    },
    []
  );

  const handleConfirmRestore = useCallback(async () => {
    if (!restoreTarget) return;
    setIsActionLoading(true);
    try {
      const config = ENTITY_SECTIONS.find(s => s.type === restoreTarget.type);
      if (config) {
        const label = ENTITY_LABEL[restoreTarget.type];
        // Restore services return { error } rather than throwing; surface it so a
        // failed restore isn't silently swallowed (and a success is confirmed).
        const result = (await config.restore(restoreTarget.id, user?.id)) as
          { error?: unknown } | undefined;
        if (result?.error) {
          logger.error('Failed to restore entity', 'trash', { target: restoreTarget });
          notifications.error(`Couldn't restore ${label}. Please try again.`);
          return;
        }
        logger.info('Entity restored', 'trash', { type: restoreTarget.type, id: restoreTarget.id });
        // A restore can succeed and still leave something for a human (MYK9-607).
        const notice = config.describeRestore?.(result) ?? null;
        if (notice) notifications.warning(notice);
        else notifications.success(`${label} restored`);
        setCounts(prev => ({
          ...prev,
          [restoreTarget.type]: Math.max(0, prev[restoreTarget.type] - 1),
        }));
        setLastActionType(restoreTarget.type);
        setActionVersion(v => v + 1);
      }
    } catch (_err) {
      logger.error('Failed to restore entity', 'trash', { target: restoreTarget });
      notifications.error('Failed to restore. Please try again.');
    } finally {
      setRestoreTarget(null);
      setIsActionLoading(false);
    }
  }, [restoreTarget, user?.id]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setIsActionLoading(true);
    try {
      const config = ENTITY_SECTIONS.find(s => s.type === deleteTarget.type);
      if (config) {
        const label = ENTITY_LABEL[deleteTarget.type];
        const result = (await config.hardDelete(deleteTarget.id)) as
          { error?: { code?: string; message?: string } | null } | undefined;
        if (result?.error) {
          logger.error('Failed to permanently delete entity', 'trash', { target: deleteTarget });
          // MYK9-527 / MYK9-750: a refusal is not a transient failure, so do
          // not tell the admin to try again; say what blocks the delete.
          notifications.error(
            permanentDeleteRefusalMessage(result.error) ??
              `Couldn't permanently delete ${label}. Please try again.`
          );
          return;
        }
        logger.info('Entity permanently deleted', 'trash', {
          type: deleteTarget.type,
          id: deleteTarget.id,
        });
        notifications.success(`${label} permanently deleted`);
        setCounts(prev => ({
          ...prev,
          [deleteTarget.type]: Math.max(0, prev[deleteTarget.type] - 1),
        }));
        setLastActionType(deleteTarget.type);
        setActionVersion(v => v + 1);
      }
    } catch (_err) {
      logger.error('Failed to permanently delete entity', 'trash', { target: deleteTarget });
      notifications.error('Failed to permanently delete. Please try again.');
    } finally {
      setDeleteTarget(null);
      setIsActionLoading(false);
    }
  }, [deleteTarget]);

  /* ---- Derived --------------------------------------------------- */

  const totalDeleted = Object.values(counts).reduce((a, b) => a + b, 0);

  // One view per entity type, with its live count. A type with nothing in the
  // trash drops out unless it is the view the URL asks for.
  const [searchParams, setSearchParams] = useSearchParams();
  const typeParam = searchParams.get('type');
  const activeType: EntityType | null = isEntityType(typeParam) ? typeParam : null;
  const views = useMemo<ListView[]>(
    () => [
      { id: 'all', label: 'All', count: totalDeleted },
      ...ENTITY_SECTIONS.filter(
        config => counts[config.type] > 0 || config.type === activeType
      ).map(config => ({ id: config.type, label: config.label, count: counts[config.type] })),
    ],
    [counts, totalDeleted, activeType]
  );
  const visibleSections = activeType
    ? ENTITY_SECTIONS.filter(config => config.type === activeType)
    : ENTITY_SECTIONS;

  /* ---- Render ---------------------------------------------------- */

  if (isLoadingCounts) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading trash...
      </div>
    );
  }

  if (totalDeleted === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Trash2 className="h-12 w-12 mb-4 opacity-30" />
        <p className="text-lg font-medium">Trash is empty</p>
        <p className="text-sm mt-1">Deleted items will appear here for review.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Entity sections */}
      <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-muted-foreground" />
            Deleted Items ({totalDeleted})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <div className="pb-3">
            <ListViewTabs
              label="Filter deleted items by type"
              views={views}
              activeId={activeType ?? 'all'}
              onSelect={id =>
                patchSearchParams(setSearchParams, { type: id === 'all' ? null : id })
              }
            />
            <ListResultLine
              className="mt-2"
              shown={activeType ? counts[activeType] : totalDeleted}
              total={totalDeleted}
              noun={ITEM_NOUN}
              filtered={activeType !== null}
              onShowAll={() => patchSearchParams(setSearchParams, { type: null })}
            />
          </div>
          {visibleSections.map(config => (
            <DeletedEntitySection
              // The view is part of the key: a single-type view mounts its
              // section open, an All view mounts it collapsed.
              key={`${config.type}:${activeType ?? 'all'}`}
              config={config}
              count={counts[config.type]}
              defaultOpen={activeType !== null}
              lastActionType={lastActionType}
              actionVersion={actionVersion}
              isActionLoading={isActionLoading}
              onRestore={handleShowRestore}
              onDelete={handleShowDelete}
            />
          ))}
        </CardContent>
      </Card>

      {/* Admin Information */}
      <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-purple-600" />
            Soft Delete Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="!border-amber-200/20 !bg-amber-50/10">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Restore:</strong> Restores a soft-deleted entity back to active status. The
              entity will reappear in normal lists and can be used again.
              <br />
              <br />
              <strong>Delete Forever:</strong> Permanently removes the entity from the database.
              This action cannot be undone and all related data will be lost.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Restore Confirmation Dialog */}
      <AlertDialog
        open={restoreTarget !== null}
        onOpenChange={open => {
          if (!open) setRestoreTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Restore {restoreTarget ? ENTITY_LABEL[restoreTarget.type] : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to restore &quot;{restoreTarget?.name}&quot;? This will make it
              visible and active again in the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRestore}
              disabled={isActionLoading}
              className="bg-green-500 hover:bg-green-600"
            >
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Permanent Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={open => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Permanently Delete {deleteTarget ? ENTITY_LABEL[deleteTarget.type] : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete &quot;{deleteTarget?.name}&quot;? This
              action cannot be undone and will remove all data associated with this{' '}
              {deleteTarget ? ENTITY_LABEL[deleteTarget.type].toLowerCase() : 'item'} from the
              database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isActionLoading}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete Forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
