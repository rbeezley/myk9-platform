import React, { useState } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import { FormField } from '@/components/common/FormField';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import DatePickerField from '@/components/common/DatePickerField';
import type { VetVisitRecord } from '@/types/health';

interface EditVetVisitDialogProps {
  open: boolean;
  record: VetVisitRecord | null;
  onClose: () => void;
  onSave: (record: VetVisitRecord) => void;
}

const EditVetVisitDialog: React.FC<EditVetVisitDialogProps> = ({
  open,
  record,
  onClose,
  onSave,
}) => {
  const [reason, setReason] = useState(record?.reason || '');
  const [visitDate, setVisitDate] = useState(record?.visit_date || '');
  const [notes, setNotes] = useState(record?.notes || '');
  const [vetName, setVetName] = useState(record?.vet_name || '');
  const [clinicName, setClinicName] = useState(record?.clinic_name || '');
  const [diagnosis, setDiagnosis] = useState(record?.diagnosis || '');
  const [treatment, setTreatment] = useState(record?.treatment || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!record) return;
    onSave({
      ...record,
      visit_date: visitDate,
      reason,
      diagnosis: diagnosis || undefined,
      treatment: treatment || undefined,
      vet_name: vetName || undefined,
      clinic_name: clinicName || undefined,
      notes: notes || undefined,
    });
  };

  return (
    <StandardDialog
      open={open}
      onClose={onClose}
      onSave={() =>
        document
          .getElementById('edit-vet-visit-form')
          ?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
      }
      title="Edit Vet Visit"
      description="All fields are required."
      formId="edit-vet-visit-form"
      saveLabel="Save"
    >
      <form id="edit-vet-visit-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField label="Reason" fieldId="editVetVisitReason" required>
          <Input
            id="editVetVisitReason"
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            required
          />
        </FormField>
        <div>
          <DatePickerField label="Date" value={visitDate} onChange={setVisitDate} required />
        </div>
        <FormField label="Vet Name" fieldId="editVetVisitVetName" required>
          <Input
            id="editVetVisitVetName"
            type="text"
            value={vetName}
            onChange={e => setVetName(e.target.value)}
            required
          />
        </FormField>
        <FormField label="Clinic Name" fieldId="editVetVisitClinicName">
          <Input
            id="editVetVisitClinicName"
            type="text"
            value={clinicName}
            onChange={e => setClinicName(e.target.value)}
          />
        </FormField>
        <FormField label="Diagnosis" fieldId="editVetVisitDiagnosis">
          <Textarea
            id="editVetVisitDiagnosis"
            value={diagnosis}
            onChange={e => setDiagnosis(e.target.value)}
          />
        </FormField>
        <FormField label="Treatment" fieldId="editVetVisitTreatment">
          <Textarea
            id="editVetVisitTreatment"
            value={treatment}
            onChange={e => setTreatment(e.target.value)}
          />
        </FormField>
        <FormField label="Notes" fieldId="editVetVisitNotes">
          <Textarea id="editVetVisitNotes" value={notes} onChange={e => setNotes(e.target.value)} />
        </FormField>
      </form>
    </StandardDialog>
  );
};

export default EditVetVisitDialog;
