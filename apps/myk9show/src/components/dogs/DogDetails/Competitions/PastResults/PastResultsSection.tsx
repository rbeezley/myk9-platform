import React from 'react';
import ShowSourceBadge from "../ShowSourceBadge";
import ThreeDotMenu from '@/components/ui/ThreeDotMenu';
import PastResultViewDialog from './PastResultViewDialog';
import PastResultEditDialog from './PastResultEditDialog';
import StandardDialog from '@/components/common/StandardDialog';
import { formatDateMMDDYYYY } from '@/utils/dateFormat';
import type { PastResult } from '@/types/results-types';
import { Eye, Edit, Trash2 } from 'lucide-react';
import { usePastResultsStore } from '@/store/pastResultsStore';

const resultBadgeColor = (result: string) => {
  if (result.includes('1st')) return 'bg-yellow-400/30 text-yellow-700 dark:bg-yellow-500/30 dark:text-yellow-400';
  if (result.includes('2nd')) return 'bg-sky-400/30 text-sky-700 dark:bg-sky-500/30 dark:text-sky-400';
  if (result.includes('3rd')) return 'bg-orange-400/30 text-orange-700 dark:bg-orange-500/30 dark:text-orange-400';
  return 'bg-muted text-muted-foreground';
};

const PastResultsSection: React.FC<{ addDialogOpen: boolean; setAddDialogOpen: (open: boolean) => void }> = ({ addDialogOpen, setAddDialogOpen }) => {
  const [viewDialogOpen, setViewDialogOpen] = React.useState(false);
  const [editDialogOpen, setEditDialogOpen] = React.useState(false);
  const [selectedResult, setSelectedResult] = React.useState<PastResult | null>(null);
  const results = usePastResultsStore(state => state.results);
  const addResult = usePastResultsStore(state => state.addResult);
  const editResult = usePastResultsStore(state => state.editResult);
  const deleteResult = usePastResultsStore(state => state.deleteResult);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [resultToDelete, setResultToDelete] = React.useState<PastResult | null>(null);

  const handleAdd = () => {
    setSelectedResult(null);
    setEditDialogOpen(true);
  };

  const handleView = (result: PastResult) => {
    setSelectedResult(result);
    setViewDialogOpen(true);
  };
  const handleEdit = (result: PastResult) => {
    setSelectedResult(result);
    setEditDialogOpen(true);
  };
  const handleSave = (updated: PastResult) => {
    if (!updated.id) {
      addResult({ ...updated, id: (results.length + 1).toString() });
    } else {
      editResult(updated.id, updated);
    }
    setEditDialogOpen(false);
    setSelectedResult(null);
    setAddDialogOpen(false);
  };

  React.useEffect(() => {
    if (addDialogOpen) handleAdd();
  }, [addDialogOpen]);

  return (
    <div className="myk9-section-content">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((result) => (
          <div key={result.id} className="myk9-record-card">
            <div className="myk9-record-header">
              <div className="flex items-center gap-2">
                <ShowSourceBadge source={result.source === 'external' ? 'external' : 'myK9Show'} />
                <span className="myk9-record-title">{result.showName}</span>
              </div>
              <ThreeDotMenu
                items={[
                  { label: 'View', icon: <Eye className="w-4 h-4 mr-2" />, onClick: () => handleView(result) },
                  { label: 'Edit', icon: <Edit className="w-4 h-4 mr-2" />, onClick: () => handleEdit(result) },
                  { label: 'Delete', icon: <Trash2 className="w-4 h-4 mr-2" />, onClick: () => { setResultToDelete(result); setDeleteDialogOpen(true); }, className: 'text-red-600' },
                ]}
              />
            </div>
            <div className="myk9-record-content">
              <div className="myk9-record-meta mb-2">
                Class: {result.className} • Judge: {result.judge || 'N/A'}
              </div>
              <div className="flex gap-2 flex-wrap mb-2">
                <span className={`px-2 py-1 rounded-full font-semibold text-xs ${resultBadgeColor(result.placement)}`}>
                  {result.placement}
                </span>
                <span className="px-2 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium">
                  {result.points} pts
                </span>
              </div>
              <div className="myk9-record-meta">
                {result.date ? formatDateMMDDYYYY(result.date) : ''}
              </div>
            </div>
          </div>
        ))}
      </div>
      <PastResultViewDialog
        open={viewDialogOpen}
        onClose={() => setViewDialogOpen(false)}
        result={selectedResult}
      />
      <PastResultEditDialog
        open={editDialogOpen || addDialogOpen}
        onClose={() => { setEditDialogOpen(false); setAddDialogOpen(false); setSelectedResult(null); }}
        onSave={handleSave}
        initialResult={selectedResult || undefined}
      />
      <StandardDialog
        open={deleteDialogOpen}
        title="Delete Past Result"
        description=""
        onClose={() => { setDeleteDialogOpen(false); setResultToDelete(null); }}
        onSave={() => {
          if (resultToDelete && resultToDelete.id) {
            deleteResult(resultToDelete.id);
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
            <>Are you sure you want to delete <b>"{resultToDelete.showName}"</b>? This action cannot be undone.</>
          ) : null}
        </div>
      </StandardDialog>
    </div>
  );
};

export default PastResultsSection;
