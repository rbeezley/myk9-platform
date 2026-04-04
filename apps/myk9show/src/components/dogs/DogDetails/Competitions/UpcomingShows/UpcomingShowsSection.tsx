import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar } from 'lucide-react';
import SectionCard from '@/components/common/SectionCard';
import { EmptyState } from '@/components/common/EmptyState';
import AddExternalShowDialog from './AddExternalShowDialog';
import ShowDetailsDialog from './ShowDetailsDialog';
import StandardDialog from '@/components/common/StandardDialog';
import ThreeDotMenu from '@/components/common/ThreeDotMenu';
import { Competition } from '@/types/competition-types';
import { formatDateMMDDYYYY } from '@/utils/dateFormat';
import { useCompetitionStore } from '@/store/competitionStore';

interface UpcomingShowsSectionProps {
  showAddDialog: boolean;
  onAddDialogClose: () => void;
}

const UpcomingShowsSection: React.FC<UpcomingShowsSectionProps> = ({
  showAddDialog,
  onAddDialogClose,
}) => {
  // Zustand competitions store
  const competitions = useCompetitionStore(state => state.competitions);
  const addCompetition = useCompetitionStore(state => state.addCompetition);
  const editCompetition = useCompetitionStore(state => state.editCompetition);
  const deleteCompetition = useCompetitionStore(state => state.deleteCompetition);

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
    if (!updatedComp.id) {
      addCompetition({ ...updatedComp, id: crypto.randomUUID() });
    } else {
      editCompetition(updatedComp.id, updatedComp);
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

  return (
    <section className="py-2 text-foreground transition-colors duration-300">
      <div className="w-full">
        <div className="flex flex-col gap-3 w-full px-4">
          {/* Empty state or responsive grid for upcoming shows */}
          {competitions.length === 0 ? (
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
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {competitions.map(show => (
                <SectionCard key={show.id}>
                  <div className="relative flex flex-col gap-2">
                    <div className="flex items-start justify-between">
                      <div className="font-semibold text-base mb-1 flex items-center gap-2 flex-wrap">
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
          )}
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
          {/* End Responsive grid */}
        </div>
      </div>
    </section>
  );
};

export default UpcomingShowsSection;
