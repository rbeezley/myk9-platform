import React, { useState } from 'react';
import AddTitleProgressDialog, { TitleProgress } from './AddTitleProgressDialog';
import EditTitleProgressDialog from './EditTitleProgressDialog';
import TitleProgressDetailsDialog from './TitleProgressDetailsDialog';
import ThreeDotMenu from '@/components/ui/ThreeDotMenu';
import { CommonDialog } from '@/components/common/CommonDialog';
import { Button } from '@/components/ui/button';
import { Plus, Eye, Edit, Trash2 } from 'lucide-react';
import { formatDateMMDDYYYY } from '@/utils/dateFormat';

interface TitleProgressSectionProps {
  initialTitleProgressList?: TitleProgress[];
}

const TitleProgressSection: React.FC<TitleProgressSectionProps> = ({ initialTitleProgressList = [] }) => {
  const [titleProgressList, setTitleProgressList] = useState<TitleProgress[]>(initialTitleProgressList);
  const [addTitleProgressOpen, setAddTitleProgressOpen] = useState(false);
  const [editTitleProgressState, setEditTitleProgressState] = useState<TitleProgress | null>(null);
  const [deleteTitleProgressState, setDeleteTitleProgressState] = useState<TitleProgress | null>(null);
  const [detailsTitleProgressState, setDetailsTitleProgressState] = useState<TitleProgress | null>(null);

  const handleAdd = (progress: TitleProgress) => {
    setTitleProgressList((prev) => [...prev, { ...progress, id: Date.now() }]);
    setAddTitleProgressOpen(false);
  };
  const handleEdit = (progress: TitleProgress) => {
    setTitleProgressList((prev) => prev.map((p) => (p.id === progress.id ? progress : p)));
    setEditTitleProgressState(null);
  };
  const handleDelete = (id: number) => {
    setTitleProgressList((prev) => prev.filter((p) => p.id !== id));
    setDeleteTitleProgressState(null);
  };

  return (
    <div className="mb-6">
      <div className="bg-background rounded-xl border p-6 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold flex items-center">Title Progress</h3>
          <Button
            onClick={() => setAddTitleProgressOpen(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Title Progress
          </Button>
        </div>
        <ul className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {titleProgressList.map((progress) => (
            <li key={progress.id}>
              <div className="bg-muted p-5 rounded-lg border flex flex-col gap-2 relative">
                <div className="absolute top-4 right-4 z-10">
                  <ThreeDotMenu
                    items={[
                      { label: 'View', icon: <Eye className="w-4 h-4 mr-2" />, onClick: () => setDetailsTitleProgressState(progress) },
                      { label: 'Edit', icon: <Edit className="w-4 h-4 mr-2" />, onClick: () => setEditTitleProgressState(progress) },
                      { label: 'Delete', icon: <Trash2 className="w-4 h-4 mr-2" />, onClick: () => setDeleteTitleProgressState(progress), className: 'text-red-600' },
                    ]}
                  />
                </div>
                <div className="font-bold">{progress.organization}</div>
                <div className="text-sm text-muted-foreground mb-1">
                  <span>Title Type:</span> <span className="text-foreground font-medium">{progress.titleType}</span>
                </div>
                <div className="text-sm text-muted-foreground mb-1">
                  <span>Title Level:</span> <span className="text-foreground font-medium">{progress.titleLevel}</span>
                </div>
                <div className="text-sm text-muted-foreground mb-1">
                  <span>Legs:</span> <span className="text-foreground font-medium">{progress.legNumber}</span>
                </div>
                <div className="text-sm text-muted-foreground mb-1">
                  <span>Points:</span> <span className="text-foreground font-medium">{progress.points}</span>
                </div>
                <div className="text-sm text-muted-foreground mb-1">
                  <span>Date:</span> <span className="text-foreground font-medium">{formatDateMMDDYYYY(progress.date)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <AddTitleProgressDialog
        open={addTitleProgressOpen}
        onClose={() => setAddTitleProgressOpen(false)}
        onAdd={handleAdd}
      />
      {editTitleProgressState && (
        <EditTitleProgressDialog
          open={!!editTitleProgressState}
          progress={editTitleProgressState}
          onClose={() => setEditTitleProgressState(null)}
          onSave={handleEdit}
        />
      )}
      {detailsTitleProgressState && (
        <TitleProgressDetailsDialog
          open={!!detailsTitleProgressState}
          progress={detailsTitleProgressState}
          onClose={() => setDetailsTitleProgressState(null)}
        />
      )}
      {deleteTitleProgressState && (
        <CommonDialog
          open={!!deleteTitleProgressState}
          onClose={() => setDeleteTitleProgressState(null)}
          title="Delete Title Progress"
          description="Are you sure you want to delete this title progress entry? This action cannot be undone."
          footer={
            <>
              <Button variant="outline" onClick={() => setDeleteTitleProgressState(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => handleDelete(deleteTitleProgressState.id!)}>Delete</Button>
            </>
          }
        >
          <div className="mb-2">
            <span className="font-semibold">{deleteTitleProgressState.organization} - {deleteTitleProgressState.titleType} ({deleteTitleProgressState.titleLevel})</span>
          </div>
          <div className="text-sm text-muted-foreground mb-2">
            Legs: {deleteTitleProgressState.legNumber} | Points: {deleteTitleProgressState.points} | {formatDateMMDDYYYY(deleteTitleProgressState.date)}
          </div>
        </CommonDialog>
      )}
    </div>
  );
};

export default TitleProgressSection;
