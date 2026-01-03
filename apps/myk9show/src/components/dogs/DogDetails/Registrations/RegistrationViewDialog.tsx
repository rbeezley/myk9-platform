import React from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import { X } from 'lucide-react';
import type { Registration } from '@/types/dog-types';

interface RegistrationViewDialogProps {
  open: boolean;
  onClose: () => void;
  registration: Registration | null;
  formatDateMMDDYYYY: (dateStr?: string) => string;
}

const RegistrationViewDialog: React.FC<RegistrationViewDialogProps> = ({ open, onClose, registration, formatDateMMDDYYYY }) => {
  if (!registration) return null;
  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      onSave={onClose}
      title="Registration Details"
      description={registration.organization + ' Registration'}
      saveLabel="Close"
      cancelLabel=""
      saveIcon={<X className="w-4 h-4 mr-2" />}
    >
      <div className="space-y-3">
        <div><span className="font-semibold">Organization:</span> {registration.organization}</div>
        <div><span className="font-semibold">Registered Name:</span> {registration.registeredName}</div>
        <div><span className="font-semibold">Registration Number:</span> {registration.applicationNumber || registration.registrationNumber}</div>
        <div><span className="font-semibold">Breed:</span> {registration.breed}</div>
        <div><span className="font-semibold">Variety:</span> {registration.variety || '-'}</div>
        <div><span className="font-semibold">Status:</span> {registration.status}</div>
        <div><span className="font-semibold">Registration Date:</span> {formatDateMMDDYYYY(registration.registrationDate)}</div>
        {registration.submissionDate && (
          <div><span className="font-semibold">Submission Date:</span> {formatDateMMDDYYYY(registration.submissionDate)}</div>
        )}
        {registration.certificate && (
          <div><span className="font-semibold">Certificate:</span> <span className="text-blue-600">Available</span></div>
        )}
      </div>
    </StandardDialog>
  );
};

export default RegistrationViewDialog;
