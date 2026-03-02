import React, { useState } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import RequiredLabel from '@/components/common/RequiredLabel';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import DatePickerField from '@/components/common/DatePickerField';
import { Plus } from 'lucide-react';

type HealthItemType = 'vaccination' | 'medication' | 'allergy' | 'vet_visit';

interface AddHealthItemDialogProps {
  open: boolean;
  type: HealthItemType;
  dogId: string;
  onClose: () => void;
  onAdd: (type: HealthItemType, data: Record<string, unknown>) => void;
}

const typeLabels: Record<HealthItemType, string> = {
  vaccination: 'Vaccination',
  medication: 'Medication',
  allergy: 'Allergy',
  vet_visit: 'Vet Visit',
};

const AddHealthItemDialog: React.FC<AddHealthItemDialogProps> = ({
  open,
  type,
  dogId,
  onClose,
  onAdd,
}) => {
  // Shared fields
  const [notes, setNotes] = useState('');

  // Vaccination fields
  const [vaccineName, setVaccineName] = useState('');
  const [dateGiven, setDateGiven] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [vetName, setVetName] = useState('');
  const [lotNumber, setLotNumber] = useState('');

  // Medication fields
  const [medicationName, setMedicationName] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Allergy fields
  const [allergen, setAllergen] = useState('');
  const [reaction, setReaction] = useState('');
  const [severity, setSeverity] = useState('');
  const [discoveredDate, setDiscoveredDate] = useState('');

  // Vet visit fields
  const [visitDate, setVisitDate] = useState('');
  const [reason, setReason] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [treatment, setTreatment] = useState('');
  const [cost, setCost] = useState('');

  const VACCINE_PRESETS = ['Rabies', 'DHPP', 'Bordetella', 'Leptospirosis'];

  const resetForm = () => {
    setNotes('');
    setVaccineName('');
    setDateGiven('');
    setExpirationDate('');
    setVetName('');
    setLotNumber('');
    setMedicationName('');
    setDosage('');
    setFrequency('');
    setStartDate('');
    setEndDate('');
    setAllergen('');
    setReaction('');
    setSeverity('');
    setDiscoveredDate('');
    setVisitDate('');
    setReason('');
    setDiagnosis('');
    setTreatment('');
    setCost('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let data: Record<string, unknown> = { dog_id: dogId };

    switch (type) {
      case 'vaccination':
        data = {
          ...data,
          vaccine_name: vaccineName,
          date_given: dateGiven,
          expiration_date: expirationDate || undefined,
          vet_name: vetName || undefined,
          lot_number: lotNumber || undefined,
          notes: notes || undefined,
        };
        break;
      case 'medication':
        data = {
          ...data,
          medication_name: medicationName,
          dosage: dosage || undefined,
          frequency: frequency || undefined,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          is_active: true,
          notes: notes || undefined,
        };
        break;
      case 'allergy':
        data = {
          ...data,
          allergen,
          reaction: reaction || undefined,
          severity: severity || undefined,
          discovered_date: discoveredDate || undefined,
          notes: notes || undefined,
        };
        break;
      case 'vet_visit':
        data = {
          ...data,
          visit_date: visitDate,
          reason,
          diagnosis: diagnosis || undefined,
          treatment: treatment || undefined,
          vet_name: vetName || undefined,
          cost: cost ? parseFloat(cost) : undefined,
          notes: notes || undefined,
        };
        break;
    }

    onAdd(type, data);
    resetForm();
    onClose();
  };

  const formId = 'add-health-item-form';

  return (
    <StandardDialog
      open={open}
      onClose={() => {
        resetForm();
        onClose();
      }}
      onSave={() =>
        document
          .getElementById(formId)
          ?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
      }
      title={`Add ${typeLabels[type]}`}
      formId={formId}
      saveLabel={
        <>
          <Plus className="mr-2 h-4 w-4" /> Add
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4">
        {type === 'vaccination' && (
          <>
            <div>
              <RequiredLabel required>Vaccine Name</RequiredLabel>
              <Input
                value={vaccineName}
                onChange={e => setVaccineName(e.target.value)}
                required
                placeholder="e.g., Rabies"
              />
              <div className="flex gap-1 mt-2 flex-wrap">
                {VACCINE_PRESETS.map(preset => (
                  <button
                    key={preset}
                    type="button"
                    className="text-xs px-2 py-1 rounded-full border hover:bg-muted transition-colors"
                    onClick={() => setVaccineName(preset)}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
            <DatePickerField
              label="Date Given"
              value={dateGiven}
              onChange={setDateGiven}
              required
            />
            <DatePickerField
              label="Expiration Date"
              value={expirationDate}
              onChange={setExpirationDate}
            />
            <div>
              <RequiredLabel>Veterinarian</RequiredLabel>
              <Input value={vetName} onChange={e => setVetName(e.target.value)} />
            </div>
            <div>
              <RequiredLabel>Lot Number</RequiredLabel>
              <Input value={lotNumber} onChange={e => setLotNumber(e.target.value)} />
            </div>
          </>
        )}

        {type === 'medication' && (
          <>
            <div>
              <RequiredLabel required>Medication Name</RequiredLabel>
              <Input
                value={medicationName}
                onChange={e => setMedicationName(e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <RequiredLabel>Dosage</RequiredLabel>
                <Input
                  value={dosage}
                  onChange={e => setDosage(e.target.value)}
                  placeholder="e.g., 50mg"
                />
              </div>
              <div>
                <RequiredLabel>Frequency</RequiredLabel>
                <Input
                  value={frequency}
                  onChange={e => setFrequency(e.target.value)}
                  placeholder="e.g., Twice daily"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <DatePickerField label="Start Date" value={startDate} onChange={setStartDate} />
              <DatePickerField label="End Date" value={endDate} onChange={setEndDate} />
            </div>
          </>
        )}

        {type === 'allergy' && (
          <>
            <div>
              <RequiredLabel required>Allergen</RequiredLabel>
              <Input
                value={allergen}
                onChange={e => setAllergen(e.target.value)}
                required
                placeholder="e.g., Chicken"
              />
            </div>
            <div>
              <RequiredLabel>Reaction</RequiredLabel>
              <Input
                value={reaction}
                onChange={e => setReaction(e.target.value)}
                placeholder="e.g., Skin irritation"
              />
            </div>
            <div>
              <RequiredLabel>Severity</RequiredLabel>
              <select
                value={severity}
                onChange={e => setSeverity(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="">Select severity</option>
                <option value="mild">Mild</option>
                <option value="moderate">Moderate</option>
                <option value="severe">Severe</option>
                <option value="life_threatening">Life Threatening</option>
              </select>
            </div>
            <DatePickerField
              label="Discovered Date"
              value={discoveredDate}
              onChange={setDiscoveredDate}
            />
          </>
        )}

        {type === 'vet_visit' && (
          <>
            <DatePickerField
              label="Visit Date"
              value={visitDate}
              onChange={setVisitDate}
              required
            />
            <div>
              <RequiredLabel required>Reason</RequiredLabel>
              <Input
                value={reason}
                onChange={e => setReason(e.target.value)}
                required
                placeholder="e.g., Annual checkup"
              />
            </div>
            <div>
              <RequiredLabel>Diagnosis</RequiredLabel>
              <Textarea value={diagnosis} onChange={e => setDiagnosis(e.target.value)} />
            </div>
            <div>
              <RequiredLabel>Treatment</RequiredLabel>
              <Textarea value={treatment} onChange={e => setTreatment(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <RequiredLabel>Veterinarian</RequiredLabel>
                <Input value={vetName} onChange={e => setVetName(e.target.value)} />
              </div>
              <div>
                <RequiredLabel>Cost ($)</RequiredLabel>
                <Input
                  type="number"
                  step="0.01"
                  value={cost}
                  onChange={e => setCost(e.target.value)}
                />
              </div>
            </div>
          </>
        )}

        <div>
          <RequiredLabel>Notes</RequiredLabel>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
      </form>
    </StandardDialog>
  );
};

export default AddHealthItemDialog;
