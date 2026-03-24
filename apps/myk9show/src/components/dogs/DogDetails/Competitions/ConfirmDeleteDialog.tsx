import React from 'react';
import { CommonDialog } from '@/components/common/CommonDialog';
import type { Show } from '@/types/show-types';

interface ConfirmDeleteDialogProps {
  show: Show | null;
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const ConfirmDeleteDialog: React.FC<ConfirmDeleteDialogProps> = ({
  show,
  open,
  onCancel,
  onConfirm,
}) => {
  if (!open || !show) return null;
  return (
    <CommonDialog
      open={open}
      onClose={onCancel}
      title="Delete Show"
      description="Are you sure you want to delete this show? This action cannot be undone."
      footer={
        <>
          <button
            type="button"
            className="inline-flex items-center px-4 py-2 rounded-lg border border-gray-300 bg-card text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex items-center px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            onClick={onConfirm}
          >
            <svg
              className="w-4 h-4 mr-2 -ml-1"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Delete
          </button>
        </>
      }
      maxWidth="max-w-md"
    >
      {show && (
        <div className="text-sm text-gray-700">
          <div className="mb-2">
            <span className="font-semibold">{show.name}</span>
          </div>
          <div className="mb-1 text-xs text-gray-500">
            Date: <span className="text-gray-700">{show.startDate}</span>
          </div>
          <div className="mb-1 text-xs text-gray-500">
            Location: <span className="text-gray-700">{show.location}</span>
          </div>
        </div>
      )}
    </CommonDialog>
  );
};

export default ConfirmDeleteDialog;
