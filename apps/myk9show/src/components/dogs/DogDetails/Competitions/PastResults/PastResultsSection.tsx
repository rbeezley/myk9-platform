import React from 'react';
import ShowSourceBadge from '../ShowSourceBadge';
import ThreeDotMenu from '@/components/ui/ThreeDotMenu';
import PastResultViewDialog from './PastResultViewDialog';
import PastResultEditDialog from './PastResultEditDialog';
import StandardDialog from '@/components/common/StandardDialog';
import { formatDateMMDDYYYY } from '@/utils/dateFormat';
import type { PastResult } from '@/types/results-types';
import { Eye, Edit, Trash2 } from 'lucide-react';
import {
  useManualResultsQuery,
  useCreateManualResultMutation,
  useUpdateManualResultMutation,
  useDeleteManualResultMutation,
} from '@/hooks/queries/useManualResultsDatabase';
import { useExhibitorResults } from '@/hooks/queries/useExhibitorResults';
import { useAuthContext } from '@/hooks/useAuthContext';
import type { ManualResult } from '@/types/manual-result-types';
import { ResultBadge } from '@/components/common/ResultBadge';

// Map ManualResult → PastResult for view/edit dialogs (bridge)
function manualToPastResult(mr: ManualResult): PastResult {
  return {
    id: mr.id,
    showName: mr.show_name,
    date: mr.trial_date,
    judge: mr.judge || '',
    className: `${mr.element} ${mr.level}${mr.section ? ` (${mr.section})` : ''}`,
    placement: mr.placement != null ? String(mr.placement) : '',
    notes: mr.notes ?? '',
    points: mr.points_earned,
    source: 'external',
  };
}

interface PastResultsSectionProps {
  dogId: string;
  addDialogOpen: boolean;
  setAddDialogOpen: (open: boolean) => void;
}

const PastResultsSection: React.FC<PastResultsSectionProps> = ({
  dogId,
  addDialogOpen,
  setAddDialogOpen,
}) => {
  const [viewDialogOpen, setViewDialogOpen] = React.useState(false);
  const [editDialogOpen, setEditDialogOpen] = React.useState(false);
  const [selectedResult, setSelectedResult] = React.useState<PastResult | null>(null);
  const [selectedManualId, setSelectedManualId] = React.useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [resultToDelete, setResultToDelete] = React.useState<{
    id: string;
    name: string;
  } | null>(null);

  const { user } = useAuthContext();

  // Manual results from DB
  const { data: manualResults = [] } = useManualResultsQuery(dogId);
  const createMutation = useCreateManualResultMutation();
  const updateMutation = useUpdateManualResultMutation();
  const deleteMutation = useDeleteManualResultMutation();

  // Platform-scored results
  const { data: exhibitorResults = [] } = useExhibitorResults();
  const platformResults = exhibitorResults.filter(r => r.dogId === dogId);

  const handleAdd = () => {
    setSelectedResult(null);
    setSelectedManualId(null);
    setEditDialogOpen(true);
  };

  const handleView = (result: PastResult) => {
    setSelectedResult(result);
    setViewDialogOpen(true);
  };

  const handleEdit = (result: PastResult, manualId: string) => {
    setSelectedResult(result);
    setSelectedManualId(manualId);
    setEditDialogOpen(true);
  };

  const handleSave = (updated: PastResult) => {
    if (!user?.id) return;

    if (selectedManualId) {
      updateMutation.mutate({
        id: selectedManualId,
        updates: {
          show_name: updated.showName,
          trial_date: updated.date,
          judge: updated.judge || null,
          notes: updated.notes || null,
          placement: updated.placement ? parseInt(updated.placement, 10) || null : null,
          points_earned: updated.points || 0,
        },
      });
    } else {
      createMutation.mutate({
        dog_id: dogId,
        owner_id: user.id,
        organization: '',
        sport_template_id: null,
        show_name: updated.showName,
        trial_date: updated.date,
        judge: updated.judge || null,
        location: null,
        element: 'General',
        level: 'Open',
        section: null,
        result_status: 'qualified',
        search_time_seconds: null,
        placement: updated.placement ? parseInt(updated.placement, 10) || null : null,
        points_earned: updated.points || 0,
        notes: updated.notes || null,
        source: 'manual',
      });
    }
    setEditDialogOpen(false);
    setSelectedResult(null);
    setSelectedManualId(null);
    setAddDialogOpen(false);
  };

  React.useEffect(() => {
    if (addDialogOpen) handleAdd();
  }, [addDialogOpen]);

  return (
    <div className="myk9-section-content">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {/* Platform results (read-only) */}
        {platformResults.map(result => (
          <div key={`platform-${result.id}`} className="myk9-record-card">
            <div className="myk9-record-header">
              <div className="flex items-center gap-2">
                <ShowSourceBadge source="myK9Show" />
                <span className="myk9-record-title">{result.showName}</span>
              </div>
            </div>
            <div className="myk9-record-content">
              <div className="myk9-record-meta mb-2">Class: {result.className}</div>
              <div className="flex gap-2 flex-wrap mb-2">
                <ResultBadge resultStatus={result.resultStatus} />
                {result.finalPlacement && (
                  <span className="px-2 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium">
                    #{result.finalPlacement}
                  </span>
                )}
              </div>
              <div className="myk9-record-meta">
                {result.showDate ? formatDateMMDDYYYY(result.showDate) : ''}
              </div>
            </div>
          </div>
        ))}

        {/* Manual results (editable) */}
        {manualResults.map(result => {
          const pastResult = manualToPastResult(result);
          return (
            <div key={`manual-${result.id}`} className="myk9-record-card">
              <div className="myk9-record-header">
                <div className="flex items-center gap-2">
                  <ShowSourceBadge source="external" />
                  <span className="myk9-record-title">{result.show_name}</span>
                </div>
                <ThreeDotMenu
                  items={[
                    {
                      label: 'View',
                      icon: <Eye className="w-4 h-4 mr-2" />,
                      onClick: () => handleView(pastResult),
                    },
                    {
                      label: 'Edit',
                      icon: <Edit className="w-4 h-4 mr-2" />,
                      onClick: () => handleEdit(pastResult, result.id),
                    },
                    {
                      label: 'Delete',
                      icon: <Trash2 className="w-4 h-4 mr-2" />,
                      onClick: () => {
                        setResultToDelete({ id: result.id, name: result.show_name });
                        setDeleteDialogOpen(true);
                      },
                      className: 'text-red-600',
                    },
                  ]}
                />
              </div>
              <div className="myk9-record-content">
                <div className="myk9-record-meta mb-2">
                  {result.element} {result.level}
                  {result.judge ? ` \u2022 Judge: ${result.judge}` : ''}
                </div>
                <div className="flex gap-2 flex-wrap mb-2">
                  <ResultBadge resultStatus={result.result_status} />
                  {result.placement != null && (
                    <span className="px-2 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium">
                      #{result.placement}
                    </span>
                  )}
                  <span className="px-2 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium">
                    {result.points_earned} pts
                  </span>
                </div>
                <div className="myk9-record-meta">
                  {result.trial_date ? formatDateMMDDYYYY(result.trial_date) : ''}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {platformResults.length === 0 && manualResults.length === 0 && (
        <div className="text-center text-muted-foreground py-8">
          No results yet. Add a manual result or enter shows through the platform.
        </div>
      )}

      <PastResultViewDialog
        open={viewDialogOpen}
        onClose={() => setViewDialogOpen(false)}
        result={selectedResult}
      />
      <PastResultEditDialog
        open={editDialogOpen || addDialogOpen}
        onClose={() => {
          setEditDialogOpen(false);
          setAddDialogOpen(false);
          setSelectedResult(null);
          setSelectedManualId(null);
        }}
        onSave={handleSave}
        initialResult={selectedResult || undefined}
      />
      <StandardDialog
        open={deleteDialogOpen}
        title="Delete Past Result"
        description=""
        onClose={() => {
          setDeleteDialogOpen(false);
          setResultToDelete(null);
        }}
        onSave={() => {
          if (resultToDelete) {
            deleteMutation.mutate({ id: resultToDelete.id, dogId });
          }
          setDeleteDialogOpen(false);
          setResultToDelete(null);
        }}
        saveLabel="Delete"
        cancelLabel="Cancel"
        saveButtonProps={{ variant: 'destructive' }}
      >
        <div className="text-base text-foreground">
          {resultToDelete ? (
            <>
              Are you sure you want to delete <b>&quot;{resultToDelete.name}&quot;</b>? This action
              cannot be undone.
            </>
          ) : null}
        </div>
      </StandardDialog>
    </div>
  );
};

export default PastResultsSection;
