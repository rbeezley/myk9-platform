import React from 'react';
import { CommonDialog } from '@/components/common/CommonDialog';
import { TitleProgress } from './AddTitleProgressDialog';
import { formatDateMMDDYYYY } from '@/utils/dateFormat';

interface TitleProgressDetailsDialogProps {
  open: boolean;
  progress: TitleProgress | null;
  onClose: () => void;
}

const TitleProgressDetailsDialog: React.FC<TitleProgressDetailsDialogProps> = ({ open, progress, onClose }) => {
  if (!progress) return null;
  return (
    <CommonDialog
      open={open}
      onClose={onClose}
      title="Title Progress Details"
      footer={<button type="button" className="px-4 py-2 rounded bg-gray-200" onClick={onClose}>Close</button>}
    >
      <div className="flex flex-col gap-2">
        <div><span className="font-semibold">Organization:</span> {progress.organization}</div>
        <div><span className="font-semibold">Title Type:</span> {progress.titleType}</div>
        <div><span className="font-semibold">Title Level:</span> {progress.titleLevel}</div>
        <div><span className="font-semibold">Leg Number:</span> {progress.legNumber}</div>
        <div><span className="font-semibold">Points:</span> {progress.points}</div>
        <div><span className="font-semibold">Date:</span> {formatDateMMDDYYYY(progress.date)}</div>
      </div>
    </CommonDialog>
  );
};

export default TitleProgressDetailsDialog;
