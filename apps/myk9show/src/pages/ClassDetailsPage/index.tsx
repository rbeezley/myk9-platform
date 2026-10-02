/**
 * Class Details Page
 *
 * Displays class information, entries, and results
 */

import { startTransition, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatTrialLabel } from '@myk9/core';
import { ClipboardList, LayoutDashboard, MoreVertical, Trash2 } from 'lucide-react';
import { useAuthContext } from '@/hooks/useAuthContext';
import ClassDetailsMain from '@/components/classes/ClassDetailsMain';
import { ClassEditPanel } from '@/components/panels/edit/ClassEditPanel';
import { ClassCompactHeader } from '@/components/classes/ClassCompactHeader';
import { ClassRequirementsPanel } from '@/components/classes/ClassRequirementsPanel';
import { formatClassTitle } from '@/components/classes/ClassDetailsMain.helpers';
import type { ClassData } from '@/components/classes/types/classTypes';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { usePageEditAction } from '@/features/actions/pageEditTarget';
import { useClassReleasedResults } from '@/hooks/queries/useClassReleasedResults';
import { useClassEditActions } from '@/hooks/useClassEditActions';
import { useClassDetailsData } from './useClassDetailsData';
import { useClassDetailsDialogs } from './useClassDetailsDialogs';
import {
  ClassNotFoundState,
  EmptyClassState,
  GuestClassNotFoundState,
  GuestClassUnavailableState,
  LoadingClassState,
} from './ClassStates';
import { resolveEntryToRemove } from './resolveEntryToRemove';
import { DeleteObjectDialog, classDeleteDetail, entryDeleteDetail } from '@/features/delete';
import { ExhibitorClassCallout } from './ExhibitorClassCallout';
import { SecretaryRunSheet } from './SecretaryRunSheet';
import { ClassReadinessStrip } from './ClassReadinessStrip';
import { useMyEntriesInClass } from './useMyEntriesInClass';
// Shared primitives
import { PageShell } from '@/components/common/PageShell';
import { PageHeader } from '@/components/common/PageHeader';
import { ShowPresenceProvider } from '@/features/show-presence/ShowPresenceProvider';
import { getEntryManagementHref } from '@/features/entry-operations/entryAttentionRoutes';
import { RelatedContextLinks } from '@/components/common/RelatedContextLinks';
import { buildClassDetailsRelatedLinks } from './classDetailsRelatedLinks';
import { ShowDeskReturnLink } from '@/features/show-map/cockpit/ShowDeskReturnLink';
import { getClassDetailHref } from '@/utils/classDetailHref';

const ClassDetailsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthContext();

  // Data hook
  const {
    classId,
    showId,
    trialId,
    classes,
    currentClass,
    trialClasses,
    guestClassState,
    retryGuestClassRead,
    localRawEntries,
    dbRawEntries,
    staffShowRawEntries,
    classEntries,
    entriesLoading,
    entriesError,
    parentTrial,
    parentShow,
    manageScope,
    dogs,
    updateClass,
  } = useClassDetailsData();

  const { saveClass } = useClassEditActions({
    showId: parentShow?.id,
    updateClass,
  });

  // Dialog state
  const dialogs = useClassDetailsDialogs();
  const [requirementsPanelOpen, setRequirementsPanelOpen] = useState(false);
  const { myEntries } = useMyEntriesInClass(classId);
  const myEntryIds = useMemo(() => new Set(myEntries.map(entry => entry.entryId)), [myEntries]);

  // Operational gate for this page's class-lifecycle controls (Edit Class,
  // Delete Class). This route is PUBLIC — exhibitors land here from a show
  // page — so the controls were previously rendered to everyone, contradicting
  // the read-only copy beside them (MYK9-123). Club-scoped so a club admin
  // keeps the same class controls they already have one level up on Trial
  // Details, and no more. The separate `isStaff` view flag below uses this same
  // scoped result so cross-club staff receive the public results view.
  // Reuse the page's single ownership gate rather than recomputing it — the two
  // copies drifted apart repeatedly while this was two independent calls.
  const canManageClass = manageScope.canManage;
  // The OPERATIONAL surface (run sheet) is a narrower question than the
  // lifecycle gate above: a club admin of this club keeps Edit/Delete but is
  // not show-day staff, so they read the public class entries. Operational
  // staff are held on the staff surface while the scope is still settling (and
  // when it is unavailable) so a legitimate secretary never flashes the
  // exhibitor view; cross-club staff resolve to `false` and correctly receive
  // the released-results view rather than an empty RLS-limited run sheet.
  const isStaff =
    manageScope.canOperate ||
    (manageScope.hasOperationalStaffRole && manageScope.status !== 'resolved');
  // A SCOPE failure is not an entry-load failure. The row-count escape below
  // exists so a transient entry error does not blank a run sheet that still
  // has usable rows — but when ownership was never verified, `useStaffEntrySource`
  // is false, so any rows present came from the PUBLIC query. Rendering the
  // staff surface over them shows non-staff data as a run sheet. Suppress it on
  // the state, independently of how many rows arrived.
  const scopeUnverified = manageScope.status === 'unavailable';
  const releasedResults = useClassReleasedResults(classId, currentClass?.results_released_at);
  const showReleasedResults = !isStaff && releasedResults.isReleased;
  const exhibitorClassEntries = showReleasedResults ? releasedResults.entryData : classEntries;
  const exhibitorRawEntries = showReleasedResults ? releasedResults.rawEntries : dbRawEntries;

  // Handlers
  // The shared delete dialog has deleted the class (soft, with Undo) and purged it from this
  // device; leave the page of a class that is gone.
  const handleClassDeleted = () => {
    startTransition(() => {
      if (trialId) {
        navigate(`/trials/${trialId}`);
      } else if (currentClass?.trialId) {
        navigate(`/trials/${currentClass.trialId}`);
      } else {
        navigate('/classes');
      }
    });
  };

  const handleDeleteEntry = (entryId: string) => {
    dialogs.openDeleteEntryDialog(entryId);
  };

  const classTitle = currentClass ? formatClassTitle(currentClass) || undefined : undefined;
  const parentTrialLabel = parentTrial
    ? formatTrialLabel({ name: parentTrial.name, trialNumber: parentTrial.trialNumber })
    : undefined;
  const entryToRemove = resolveEntryToRemove(dialogs.entryToDelete, {
    localRawEntries,
    dbRawEntries,
    classEntries,
    dogs,
  });
  const entryToRemoveName = entryToRemove?.dogName ?? 'this dog';

  // Rejects on failure so ClassEditPanel stays open with the user's edits.
  const handleSaveClassEdit = async (data: Partial<typeof currentClass>) => {
    if (classId && currentClass) {
      await saveClass(
        classId,
        data as Partial<ClassData>,
        currentClass.trialId,
        (currentClass as unknown as Record<string, unknown>).judgeId as string | undefined
      );
    }
  };

  // Breadcrumbs
  const breadcrumbs = useMemo(() => {
    const crumbs = [{ label: 'Shows', href: '/shows' }];
    if (parentShow) {
      crumbs.push({ label: parentShow.name, href: `/shows/${parentShow.id}` });
    }
    if (parentTrial) {
      const trialLabel = formatTrialLabel({
        name: parentTrial.name,
        trialNumber: parentTrial.trialNumber,
      });
      crumbs.push({ label: trialLabel, href: `/trials/${parentTrial.id}` });
    }
    const classLabel = currentClass ? formatClassTitle(currentClass) || 'Class' : 'Class';
    crumbs.push({
      label: classLabel,
      href:
        parentShow && parentTrial && classId
          ? getClassDetailHref(parentShow.id, parentTrial.id, classId)
          : `/classes/${classId}`,
    });
    return crumbs;
  }, [parentShow, parentTrial, currentClass, classId]);

  // INTENT: Secretary scoring has one canonical path: the paper-scoring split panel.
  // Keep class management and run-order work on this page, but route result entry
  // through the dedicated scoring flow so secretaries do not choose between tools.

  // Action buttons for the compact header
  const headerActions = useMemo(() => {
    return (
      <div className="flex items-center gap-2">
        {canManageClass && parentShow?.id && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              navigate(
                getEntryManagementHref({
                  showId: parentShow.id,
                  trialId: trialId || currentClass?.trialId || null,
                  classId: classId || null,
                })
              )
            }
          >
            <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
            Manage Entries
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Class options">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canManageClass && parentShow?.id && (
              <DropdownMenuItem onClick={() => navigate(`/shows/${parentShow.id}/show-day`)}>
                <LayoutDashboard className="mr-2 h-4 w-4" />
                Show Day
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => setRequirementsPanelOpen(true)}>
              <ClipboardList className="mr-2 h-4 w-4" />
              Requirements
            </DropdownMenuItem>
            {canManageClass && (
              <DropdownMenuItem onClick={dialogs.openDeleteDialog} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Class
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }, [
    dialogs.openDeleteDialog,
    setRequirementsPanelOpen,
    canManageClass,
    parentShow,
    trialId,
    currentClass?.trialId,
    navigate,
    classId,
  ]);

  // Edit class is the header Actions menu's (MYK9-928), behind the same gate the hero Edit
  // button had. Registered with the panel's opener, so it opens THIS page's panel.
  usePageEditAction({
    kind: 'class',
    enabled: canManageClass && !!currentClass,
    run: dialogs.openEditClassPanel,
  });

  // Early returns for different states. A guest's class is the server's
  // answer only (MYK9-785), so its states never fall through to the ones below.
  if (guestClassState === 'loading') return <LoadingClassState />;
  if (guestClassState === 'offline' || guestClassState === 'error') {
    return (
      <GuestClassUnavailableState
        offline={guestClassState === 'offline'}
        onRetry={retryGuestClassRead}
      />
    );
  }
  if (guestClassState === 'ready' && !currentClass) {
    return <GuestClassNotFoundState showId={showId} />;
  }

  if (classId && !currentClass && trialClasses.length > 0) {
    return <ClassNotFoundState />;
  }

  if (!classId || !currentClass) {
    if (classes.length === 0) {
      return <EmptyClassState />;
    }
    return <LoadingClassState />;
  }

  const className = formatClassTitle(currentClass) || 'Class';

  const relatedLinks = buildClassDetailsRelatedLinks({
    isStaff,
    showId: parentShow?.id,
    trialId: trialId || currentClass.trialId,
    classId,
  });

  return (
    // INTENT: per-show presence boundary so edit-awareness works on the staff
    // entry/results edit here (no-op until features.showEditAwareness is on, and
    // for anonymous viewers with no presence identity). One channel per show/tab.
    <ShowPresenceProvider showId={parentShow?.id}>
      <PageShell>
        <ShowDeskReturnLink showId={parentShow?.id} />
        <PageHeader breadcrumbs={breadcrumbs} title={className} />

        <ClassCompactHeader
          classData={currentClass}
          parentTrial={parentTrial}
          parentShow={parentShow}
          actions={headerActions}
        />

        <RelatedContextLinks items={relatedLinks} />

        {!isStaff && (
          <ExhibitorClassCallout classId={classId} releasedRows={releasedResults.rawEntries} />
        )}

        {isStaff && (
          <ClassReadinessStrip
            isStaff={isStaff}
            classData={currentClass}
            entries={dbRawEntries}
            scopeEntries={staffShowRawEntries}
            showId={parentShow?.id}
            trialId={trialId || currentClass.trialId}
            classId={classId}
            isLoading={entriesLoading}
            error={!scopeUnverified && dbRawEntries.length > 0 ? null : entriesError}
          />
        )}

        {isStaff && !entriesLoading ? (
          entriesError && (scopeUnverified || dbRawEntries.length === 0) ? (
            <div role="alert" className="rounded-md border border-destructive/30 p-4 text-sm">
              {entriesError}
            </div>
          ) : (
            <SecretaryRunSheet
              currentClass={currentClass}
              dbRawEntries={dbRawEntries}
              userId={user?.id ?? ''}
              myEntryIds={myEntryIds}
              dogs={dogs}
              organization={parentShow?.organization ?? null}
              parentShowId={parentShow?.id ?? null}
              classDay={parentTrial?.trialDate ?? null}
            />
          )
        ) : !isStaff ? (
          <ClassDetailsMain
            classData={currentClass}
            classEntries={exhibitorClassEntries}
            rawEntries={exhibitorRawEntries}
            parentShow={parentShow}
            onAddEntry={() => {
              if (parentShow?.id) {
                navigate(`/shows/${parentShow.id}/register`);
              }
            }}
            onDeleteEntry={handleDeleteEntry}
          />
        ) : null}

        {/* Dialogs */}
        {/* Class-lifecycle panels are mounted only for staff, not merely left
            closed: an unmounted panel cannot be opened by a stray handler and
            never subscribes to class data the viewer should not be editing. */}
        {canManageClass && (
          <>
            <ClassEditPanel
              open={dialogs.editClassPanelOpen}
              onClose={dialogs.closeEditClassPanel}
              classId={currentClass?.id || ''}
              className={currentClass?.element || ''}
              initialClassData={currentClass || {}}
              {...(parentShow?.id !== undefined && { showId: parentShow.id })}
              onSave={async classData => {
                if (currentClass?.id) {
                  const updatedClass = { ...currentClass, ...classData };
                  await handleSaveClassEdit(updatedClass);
                }
              }}
            />

            {dialogs.deleteDialogOpen && classId && currentClass && (
              <DeleteObjectDialog
                open
                onOpenChange={dialogs.setDeleteDialogOpen}
                kind="class"
                targets={[
                  {
                    id: classId,
                    name: classTitle ?? 'this class',
                    detail: classDeleteDetail({
                      level: currentClass.level,
                      element: currentClass.element,
                      trialLabel: parentTrialLabel,
                    }),
                    context: {
                      showId: parentShow?.id,
                      trialId: currentClass.trialId ?? trialId,
                      classId,
                    },
                  },
                ]}
                onDeleted={handleClassDeleted}
              />
            )}
          </>
        )}

        {dialogs.deleteEntryDialogOpen && entryToRemove && (
          <DeleteObjectDialog
            open
            onOpenChange={open => {
              if (!open) dialogs.closeDeleteEntryDialog();
            }}
            kind="entry"
            targets={[
              {
                id: entryToRemove.id,
                name: entryToRemoveName,
                detail: entryDeleteDetail({
                  callName: entryToRemoveName,
                  handlerName: entryToRemove.handlerName,
                  className: classTitle,
                }),
                context: { showId: parentShow?.id, trialId, classId },
              },
            ]}
          />
        )}

        <ClassRequirementsPanel
          open={requirementsPanelOpen}
          onClose={() => setRequirementsPanelOpen(false)}
          organization={parentShow?.organization || null}
          element={currentClass?.element || ''}
          level={currentClass?.level || ''}
        />
      </PageShell>
    </ShowPresenceProvider>
  );
};

export default ClassDetailsPage;
