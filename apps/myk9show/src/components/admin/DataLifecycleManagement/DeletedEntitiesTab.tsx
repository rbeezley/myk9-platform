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
import {
  Theater,
  Trophy,
  ListChecks,
  ClipboardList,
  Dog,
  Building2,
  Users,
  Shield,
  AlertTriangle,
  Trash2,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/services/database/supabaseClient';
import { useAuthContext } from '@/hooks/useAuthContext';
import { logger } from '@/services/LoggingService';

import {
  getDeletedShows,
  restoreShow,
  hardDeleteShow,
} from '@/services/database/shows';
import {
  getDeletedTrials,
  restoreTrial,
  hardDeleteTrial,
} from '@/services/database/trials';
import { getDeletedClasses, restoreClass, hardDeleteClass } from '@/services/database/classes';
import { getDeletedEntries, restoreEntry, hardDeleteEntry } from '@/services/database/entries';
import { getDeletedDogs, restoreDog, hardDeleteDog } from '@/services/database/dogs';
import {
  getDeletedClubs,
  restoreClub,
  hardDeleteClub,
} from '@/services/database/clubs';
import {
  getDeletedUsers,
  restoreUser,
  hardDeleteUser,
} from '@/services/database/users';

import { DeletedEntitySection } from './DeletedEntitySection';
import type { DeletedEntity, EntityType, EntitySectionConfig, SelectedEntity } from './types';

/* ------------------------------------------------------------------ */
/*  Table name lookup for count queries                                */
/* ------------------------------------------------------------------ */

const TABLE_FOR_TYPE = {
  show: 'shows',
  trial: 'trials',
  class: 'classes',
  entry: 'entries',
  dog: 'dogs',
  club: 'clubs',
  person: 'people',
} as const;

const ENTITY_LABEL: Record<EntityType, string> = {
  show: 'Show',
  trial: 'Trial',
  class: 'Class',
  entry: 'Entry',
  dog: 'Dog',
  club: 'Club',
  person: 'Person',
};

/* ------------------------------------------------------------------ */
/*  Mapper helpers – convert raw query rows to DeletedEntity           */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapShow = (row: any): DeletedEntity => ({
  id: row.id,
  name: row.name || 'Unnamed Show',
  deleted_at: row.deleted_at,
  deleted_by_email: row.deleted_by_user?.email ?? null,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapTrial = (row: any): DeletedEntity => ({
  id: row.id,
  name: row.name || 'Unnamed Trial',
  context: row.show?.name ? `Show: ${row.show.name}` : undefined,
  deleted_at: row.deleted_at,
  deleted_by_email: row.deleted_by_user?.email ?? null,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapClass = (row: any): DeletedEntity => ({
  id: row.id,
  name: row.name || 'Unnamed Class',
  context: row.trial?.name ? `Trial: ${row.trial.name}` : undefined,
  deleted_at: row.deleted_at,
  deleted_by_email: row.deleted_by_user?.email ?? null,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapEntry = (row: any): DeletedEntity => ({
  id: row.id,
  name: `${row.dog?.name ?? 'Unknown Dog'} → ${row.class?.name ?? 'Unknown Class'}`,
  context: row.class?.name,
  deleted_at: row.deleted_at,
  deleted_by_email: row.deleted_by_user?.email ?? null,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapDog = (row: any): DeletedEntity => ({
  id: row.id,
  name: row.name || 'Unnamed Dog',
  context: row.breed,
  deleted_at: row.deleted_at,
  deleted_by_email: row.deleted_by_user?.email ?? null,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapClub = (row: any): DeletedEntity => ({
  id: row.id,
  name: row.name || 'Unnamed Club',
  deleted_at: row.deleted_at,
  deleted_by_email: row.deleted_by_user?.email ?? null,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapPerson = (row: any): DeletedEntity => ({
  id: row.id,
  name: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || 'Unnamed Person',
  context: row.email,
  deleted_at: row.deleted_at,
  deleted_by_email: row.deleted_by_user?.email ?? null,
});

/* ------------------------------------------------------------------ */
/*  Fetch wrapper – normalises the { data, error } return shape        */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryFn = () => Promise<{ data: any[]; error: any } | any>;

const fetchAndMap = async (
  queryFn: QueryFn,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mapper: (row: any) => DeletedEntity
): Promise<DeletedEntity[]> => {
  const result = await queryFn();
  // Some query fns return { data, error }, others return the Supabase
  // response directly which also has { data, error }.
  const rows = result?.data ?? [];
  return rows.map(mapper);
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function DeletedEntitiesTab() {
  const { user } = useAuthContext();

  // Counts per entity type
  const [counts, setCounts] = useState<Record<EntityType, number>>({
    show: 0,
    trial: 0,
    class: 0,
    entry: 0,
    dog: 0,
    club: 0,
    person: 0,
  });
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
      const types = Object.keys(TABLE_FOR_TYPE) as EntityType[];
      const results = await Promise.all(
        types.map(async type => {
          const { count, error } = await supabase
            .from(TABLE_FOR_TYPE[type])
            .select('id', { count: 'exact', head: true })
            .not('deleted_at', 'is', null);
          if (error) {
            logger.warn(`Failed to fetch deleted count for ${type}`, 'trash', { error });
          }
          return { type, count: count ?? 0 };
        })
      );

      const next: Record<EntityType, number> = {
        show: 0,
        trial: 0,
        class: 0,
        entry: 0,
        dog: 0,
        club: 0,
        person: 0,
      };
      for (const { type, count } of results) {
        next[type] = count;
      }
      setCounts(next);
    } catch (_err) {
      logger.error('Failed to fetch deleted entity counts', 'trash');
    } finally {
      setIsLoadingCounts(false);
    }
  }, []);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  /* ---- Section configs ------------------------------------------- */

  const sections: EntitySectionConfig[] = useMemo(
    () => [
      {
        type: 'show' as EntityType,
        label: 'Shows',
        icon: Theater,
        iconColor: 'text-purple-600',
        fetchDeleted: () => fetchAndMap(getDeletedShows, mapShow),
        restore: restoreShow,
        hardDelete: hardDeleteShow,
      },
      {
        type: 'trial' as EntityType,
        label: 'Trials',
        icon: Trophy,
        iconColor: 'text-amber-600',
        fetchDeleted: () => fetchAndMap(getDeletedTrials, mapTrial),
        restore: restoreTrial,
        hardDelete: hardDeleteTrial,
      },
      {
        type: 'class' as EntityType,
        label: 'Classes',
        icon: ListChecks,
        iconColor: 'text-blue-600',
        fetchDeleted: () => fetchAndMap(getDeletedClasses, mapClass),
        restore: restoreClass,
        hardDelete: hardDeleteClass,
      },
      {
        type: 'entry' as EntityType,
        label: 'Entries',
        icon: ClipboardList,
        iconColor: 'text-green-600',
        fetchDeleted: () => fetchAndMap(getDeletedEntries, mapEntry),
        restore: restoreEntry,
        hardDelete: hardDeleteEntry,
      },
      {
        type: 'dog' as EntityType,
        label: 'Dogs',
        icon: Dog,
        iconColor: 'text-orange-600',
        fetchDeleted: () => fetchAndMap(getDeletedDogs, mapDog),
        restore: restoreDog,
        hardDelete: hardDeleteDog,
      },
      {
        type: 'club' as EntityType,
        label: 'Clubs',
        icon: Building2,
        iconColor: 'text-teal-600',
        fetchDeleted: () => fetchAndMap(getDeletedClubs, mapClub),
        restore: restoreClub,
        hardDelete: hardDeleteClub,
      },
      {
        type: 'person' as EntityType,
        label: 'People',
        icon: Users,
        iconColor: 'text-indigo-600',
        fetchDeleted: () => fetchAndMap(getDeletedUsers, mapPerson),
        restore: restoreUser,
        hardDelete: hardDeleteUser,
      },
    ],
    []
  );

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
      const config = sections.find(s => s.type === restoreTarget.type);
      if (config) {
        await config.restore(restoreTarget.id, user?.id);
        logger.info('Entity restored', 'trash', { type: restoreTarget.type, id: restoreTarget.id });
        setCounts(prev => ({
          ...prev,
          [restoreTarget.type]: Math.max(0, prev[restoreTarget.type] - 1),
        }));
        setLastActionType(restoreTarget.type);
        setActionVersion(v => v + 1);
      }
    } catch (_err) {
      logger.error('Failed to restore entity', 'trash', { target: restoreTarget });
    } finally {
      setRestoreTarget(null);
      setIsActionLoading(false);
    }
  }, [restoreTarget, sections, user?.id]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setIsActionLoading(true);
    try {
      const config = sections.find(s => s.type === deleteTarget.type);
      if (config) {
        await config.hardDelete(deleteTarget.id);
        logger.info('Entity permanently deleted', 'trash', {
          type: deleteTarget.type,
          id: deleteTarget.id,
        });
        setCounts(prev => ({
          ...prev,
          [deleteTarget.type]: Math.max(0, prev[deleteTarget.type] - 1),
        }));
        setLastActionType(deleteTarget.type);
        setActionVersion(v => v + 1);
      }
    } catch (_err) {
      logger.error('Failed to permanently delete entity', 'trash', { target: deleteTarget });
    } finally {
      setDeleteTarget(null);
      setIsActionLoading(false);
    }
  }, [deleteTarget, sections]);

  /* ---- Derived --------------------------------------------------- */

  const totalDeleted = Object.values(counts).reduce((a, b) => a + b, 0);

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
          {sections.map(config => (
            <DeletedEntitySection
              key={config.type}
              config={config}
              count={counts[config.type]}
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
