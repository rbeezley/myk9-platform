import React from 'react';
import { CommonDialog } from '@/components/common/CommonDialog';
import { Button } from '@/components/ui/button';
import {
  POSITION_DISPLAY_NAMES,
  formatRegistrationNumbers,
  type PedigreeAncestor,
} from '@/types/pedigree-types';

interface AncestorDetailsDialogProps {
  open: boolean;
  ancestor: PedigreeAncestor | null;
  onClose: () => void;
}

const AncestorDetailsDialog: React.FC<AncestorDetailsDialogProps> = ({
  open,
  ancestor,
  onClose,
}) => {
  if (!ancestor) return null;

  const regDisplay = formatRegistrationNumbers(ancestor.registration_numbers);

  return (
    <CommonDialog
      open={open}
      onClose={onClose}
      title={ancestor.registered_name}
      description={ancestor.titles || undefined}
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="flex flex-col gap-2 mb-2">
        <div className="text-xs">Position: {POSITION_DISPLAY_NAMES[ancestor.position]}</div>
        {ancestor.call_name && <div className="text-xs">Call Name: {ancestor.call_name}</div>}
        {ancestor.breed && <div className="text-xs">Breed: {ancestor.breed}</div>}
        {ancestor.color && <div className="text-xs">Color: {ancestor.color}</div>}
        {ancestor.sex && (
          <div className="text-xs">Sex: {ancestor.sex === 'male' ? 'Male' : 'Female'}</div>
        )}
        {regDisplay && <div className="text-xs">Registration: {regDisplay}</div>}
        {ancestor.date_of_birth && (
          <div className="text-xs">
            DOB:{' '}
            {new Date(ancestor.date_of_birth).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </div>
        )}
        {ancestor.health_info && <div className="text-xs">Health: {ancestor.health_info}</div>}
        {ancestor.linked_dog_id && (
          <div className="text-xs text-primary">This ancestor is linked to a platform dog.</div>
        )}
        {ancestor.photo_url && (
          <img
            src={ancestor.photo_url}
            alt={ancestor.registered_name}
            className="w-24 h-24 object-cover rounded-full border mt-2"
          />
        )}
      </div>
    </CommonDialog>
  );
};

export default AncestorDetailsDialog;
