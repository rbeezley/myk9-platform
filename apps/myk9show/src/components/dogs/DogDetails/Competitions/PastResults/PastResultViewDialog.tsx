import React from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import { X } from 'lucide-react';
import type { PastResult } from '@/types/results-types';
import { formatDateMMDDYYYY } from '@/utils/dateFormat';

interface PastResultViewDialogProps {
  open: boolean;
  onClose: () => void;
  result: PastResult | null;
}

const PastResultViewDialog: React.FC<PastResultViewDialogProps> = ({ open, onClose, result }) => {
  if (!result) return null;
  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      onSave={onClose}
      title="Past Result Details"
      description={result.showName}
      saveLabel="Close"
      cancelLabel=""
      saveIcon={<X className="w-4 h-4 mr-2" />}
    >
      <div className="space-y-3">
        <div><span className="font-semibold">Show Name:</span> {result.showName}</div>
        <div><span className="font-semibold">Date:</span> {result.date ? formatDateMMDDYYYY(result.date) : ''}</div>
        <div><span className="font-semibold">Judge:</span> {result.judge}</div>
        <div><span className="font-semibold">Class:</span> {result.className}</div>
        <div><span className="font-semibold">Placement:</span> {result.placement}</div>
        <div><span className="font-semibold">Notes:</span> {result.notes || <span className="text-gray-400">None</span>}</div>
      </div>
    </StandardDialog>
  );
};

export default PastResultViewDialog;
