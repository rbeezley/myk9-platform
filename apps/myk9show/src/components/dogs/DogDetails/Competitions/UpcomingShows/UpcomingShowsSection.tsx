import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, Calendar, WifiOff } from 'lucide-react';
import SectionCard from '@/components/common/SectionCard';
import { EmptyState } from '@/components/common/EmptyState';
import AddExternalShowDialog from './AddExternalShowDialog';
import ShowDetailsDialog from './ShowDetailsDialog';
import StandardDialog from '@/components/common/StandardDialog';
import ThreeDotMenu from '@/components/common/ThreeDotMenu';
import ShowSourceBadge from '../ShowSourceBadge';
import { Competition } from '@/types/competition-types';
import { formatDateMMDDYYYY } from '@/utils/dateFormat';
import { useCompetitionStore } from '@/store/competitionStore';
import { useDogActivity } from '@/features/_shared/hooks/useDogActivity';
import { deriveEntryPresentation } from '@/services/entryDisplay/entryPresentation';

interface UpcomingShowsSectionProps {
  dogId: string;
  /** Whose voice the entry status line speaks in — same contract as ActivityTab. */
  viewer: 'exhibitor' | 'secretary';
  showAddDialog: boolean;
  onAddDialogClose: () => void;
}

function pluralEntries(count: number): string {
  return `${count} ${count === 1 ? 'entry' : 'entries'}`;
}

function pluralExternal(count: number): string {
  return `${count} external ${count === 1 ? 'show' : 'shows'}`;
}

const UpcomingShowsSection: React.FC<UpcomingShowsSectionProps> = ({
  dogId,
  viewer,
  showAddDialog,
  onAddDialogClose,
}) => {
  // Platform entries — the same canonical dog-scoped query the Overview
  // activity card composes, so the two surfaces cannot disagree about what
  // this dog is entered in (MYK9-121).
  const { upcoming, isLoading, isError, canTrustEmpty, refetch } = useDogActivity(dogId);

  // Externally-tracked shows the owner typed in by hand. Dog-scoped: the store
  // is one flat list across every dog, so without this filter another dog's
  // external shows render on this dog's page.
  const competitions = useCompetitionStore(state => state.competitions);
  const addCompetition = useCompetitionStore(state => state.addCompetition);
  const editCompetition = useCompetitionStore(state => state.editCompetition);
  const deleteCompetition = useCompetitionStore(state => state.deleteCompetition);
  // Rows saved before dog stamping carry a blank `dogId` — the dialog's default
  // is '' and the old save path never filled it in. They belong to no dog, so
  // there is no page to file them under; hiding them everywhere would silently
  // strand data the user typed. They surface on every dog page until an edit
  // claims one (handleSave stamps the current dog), which is the migration path.
  const externalShows = React.useMemo(
    () => competitions.filter(comp => comp.dogId === dogId || !comp.dogId),
    [competitions, dogId]
  );

  // Local dialog and selection state
  const [isEditDialogOpen, setIsEditDialogOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = React.useState(false);
  const [selectedCompetition, setSelectedCompetition] = React.useState<Competition | null>(null);

  const navigate = useNavigate();
  const prevShowAddDialog = React.useRef(showAddDialog);

  // Only fire onAddDialogClose when showAddDialog transitions true → false (not on every mount)
  React.useEffect(() => {
    if (prevShowAddDialog.current && !showAddDialog) {
      onAddDialogClose();
    }
    prevShowAddDialog.current = showAddDialog;
  }, [showAddDialog, onAddDialogClose]);

  // Handlers
  const handleView = (comp: Competition) => {
    setSelectedCompetition(comp);
    setIsViewDialogOpen(true);
  };
  const handleEdit = (comp: Competition) => {
    setSelectedCompetition(comp);
    setIsEditDialogOpen(true);
  };
  const handleDelete = (comp: Competition) => {
    setSelectedCompetition(comp);
    setIsDeleteDialogOpen(true);
  };
  const handleSave = (updatedComp: Competition) => {
    // Stamp the dog whose page this is on both paths. The store is a flat list
    // keyed only by `dogId`, so an unstamped row would be invisible on every
    // dog page — added, persisted, and apparently lost.
    if (!updatedComp.id) {
      addCompetition({ ...updatedComp, id: crypto.randomUUID(), dogId });
    } else {
      editCompetition(updatedComp.id, { ...updatedComp, dogId });
    }
    onAddDialogClose();
    setIsEditDialogOpen(false);
    setSelectedCompetition(null);
  };
  const handleDeleteConfirm = () => {
    if (selectedCompetition && selectedCompetition.id) {
      deleteCompetition(selectedCompetition.id);
    }
    setIsDeleteDialogOpen(false);
    setSelectedCompetition(null);
  };

  const hasContent = upcoming.length > 0 || externalShows.length > 0;

  // An unresolved or failed read leaves `upcoming` empty for the same reason a
  // genuinely unentered dog does. Only the third case may draw the empty copy —
  // the other two would be a confident false empty state.
  const renderBody = () => {
    if (isLoading) {
      return (
        <div
          className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          aria-busy="true"
          aria-label="Loading upcoming shows"
        >
          {[0, 1].map(i => (
            <SectionCard key={`skeleton-${i}`}>
              <div className="flex flex-col gap-2">
                <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                <div className="h-3 w-24 bg-muted animate-pulse rounded" />
                <div className="h-3 w-20 bg-muted animate-pulse rounded" />
              </div>
            </SectionCard>
          ))}
        </div>
      );
    }

    if (isError) {
      return (
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't load upcoming shows"
          description="We couldn't reach your entries just now, so this list may be incomplete. Check your connection and try again."
          action={{
            label: 'Retry',
            onClick: () => refetch(),
          }}
          size="sm"
        />
      );
    }

    // Offline, an unsynced dog and an unentered dog produce the same empty
    // array — see `canTrustEmpty`. Say so rather than assert a clear calendar.
    if (!hasContent && !canTrustEmpty) {
      return (
        <EmptyState
          icon={WifiOff}
          title="Can't check for upcoming shows offline"
          description="You're offline, so this dog's entries may not have loaded. Reconnect to see the full list."
          action={{
            label: 'Try again',
            onClick: () => refetch(),
          }}
          size="sm"
        />
      );
    }

    if (!hasContent) {
      return (
        <EmptyState
          icon={Calendar}
          title="No Upcoming Shows"
          description="When you enter a show, it will appear here. Browse available shows to find one near you."
          action={{
            label: 'Browse Shows',
            onClick: () => navigate('/shows'),
            icon: Calendar,
          }}
          size="sm"
        />
      );
    }

    return (
      <>
        <div className="text-xs text-muted-foreground">
          {pluralEntries(upcoming.length)} on myK9Show
          {externalShows.length > 0 ? ` · ${pluralExternal(externalShows.length)}` : ''}
        </div>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {upcoming.map(entry => {
            const showName = entry.show?.name ?? 'Unknown show';
            const showHref = entry.show?.id ? `/shows/${entry.show.id}` : undefined;
            const { statusLine } = deriveEntryPresentation(
              { entryStatus: entry.entry_status ?? null },
              { viewer }
            );
            return (
              <SectionCard key={`entry-${entry.id}`}>
                <div className="relative flex flex-col gap-2">
                  <div className="font-semibold text-base mb-1 flex items-center gap-2 flex-wrap">
                    <ShowSourceBadge source="myK9Show" />
                    {showHref ? (
                      <Link to={showHref} className="hover:text-primary transition-colors">
                        {showName}
                      </Link>
                    ) : (
                      <span>{showName}</span>
                    )}
                  </div>
                  <div className="text-sm mb-1">{entry.class?.name ?? 'Unknown class'}</div>
                  <div className="text-xs text-muted-foreground">
                    {entry.show?.start_date ? formatDateMMDDYYYY(entry.show.start_date) : ''}
                  </div>
                  <div className="text-xs text-muted-foreground font-semibold">{statusLine}</div>
                </div>
              </SectionCard>
            );
          })}
          {externalShows.map(show => (
            <SectionCard key={`external-${show.id}`}>
              <div className="relative flex flex-col gap-2">
                <div className="flex items-start justify-between">
                  <div className="font-semibold text-base mb-1 flex items-center gap-2 flex-wrap">
                    <ShowSourceBadge source="external" />
                    {show.name}
                  </div>
                  <div className="ml-2 mt-[-6px]">
                    <ThreeDotMenu
                      onView={() => handleView(show)}
                      onEdit={() => handleEdit(show)}
                      onDelete={() => handleDelete(show)}
                    />
                  </div>
                </div>
                <div className="text-sm mb-1">{show.location}</div>
                <div className="text-xs text-muted-foreground">
                  {show.date ? formatDateMMDDYYYY(show.date) : ''}
                </div>
                <div className="text-xs text-muted-foreground font-semibold">{show.status}</div>
              </div>
            </SectionCard>
          ))}
        </div>
      </>
    );
  };

  return (
    <section className="py-2 text-foreground transition-colors duration-300">
      <div className="w-full">
        <div className="flex flex-col gap-3 w-full px-4">
          {renderBody()}
          {/* AddExternalShowDialog for Add/Edit modes */}
          <AddExternalShowDialog
            show={selectedCompetition}
            mode={isEditDialogOpen ? 'edit' : 'add'}
            open={showAddDialog || isEditDialogOpen}
            onClose={() => {
              onAddDialogClose();
              setIsEditDialogOpen(false);
              setSelectedCompetition(null);
            }}
            onSave={handleSave}
          />
          {/* ShowDetailsDialog for View mode */}
          <ShowDetailsDialog
            show={selectedCompetition}
            open={isViewDialogOpen}
            onClose={() => {
              setIsViewDialogOpen(false);
              setSelectedCompetition(null);
            }}
          />
          {/* Delete confirmation dialog */}
          <StandardDialog
            open={isDeleteDialogOpen}
            title="Delete Upcoming Show"
            description=""
            onClose={() => {
              setIsDeleteDialogOpen(false);
              setSelectedCompetition(null);
            }}
            onSave={handleDeleteConfirm}
            saveLabel="Delete"
            cancelLabel="Cancel"
            saveButtonProps={{ variant: 'destructive' }}
          >
            <div className="text-base text-foreground">
              {selectedCompetition ? (
                <>
                  Are you sure you want to delete <b>"{selectedCompetition.name}"</b>? This action
                  cannot be undone.
                </>
              ) : null}
            </div>
          </StandardDialog>
        </div>
      </div>
    </section>
  );
};

export default UpcomingShowsSection;
