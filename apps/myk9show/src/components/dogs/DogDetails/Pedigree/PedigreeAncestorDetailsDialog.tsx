import React from 'react';
import { CommonDialog } from '@/components/common/CommonDialog';
import { ExtendedAncestor } from './PedigreeAncestorAddDialog';
import { Button } from '@/components/ui/button';

interface AncestorDetailsDialogProps {
  open: boolean;
  ancestor: ExtendedAncestor | null;
  onClose: () => void;
}

const AncestorDetailsDialog: React.FC<AncestorDetailsDialogProps> = ({ open, ancestor, onClose }) => {
  if (!ancestor) return null;
  return (
    <CommonDialog
      open={open}
      onClose={onClose}
      title={ancestor.name}
      description={ancestor.title}
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="flex flex-col gap-2 mb-2">
        <div className="text-xs">Role: {ancestor.role}</div>
        <div className="text-xs">Registration: {ancestor.registration}</div>
        <div className="text-xs">DOB: {ancestor.dob ? new Date(ancestor.dob).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : ''}</div>
        {ancestor.photoUrl && (
          <img src={ancestor.photoUrl} alt={ancestor.name} className="w-24 h-24 object-cover rounded-full border mt-2" />
        )}
      </div>
    </CommonDialog>
  );
};

export default AncestorDetailsDialog;
