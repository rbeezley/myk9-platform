import React, { useState } from 'react';
import StandardDialog from '@/components/common/StandardDialog';
import RequiredLabel from '@/components/common/RequiredLabel';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import DatePickerField from '@/components/common/DatePickerField';
import { Plus, Trash2 } from 'lucide-react';

export type HealthItemType =
  | 'vaccination'
  | 'medication'
  | 'allergy'
  | 'vet_visit'
  | 'ofa_screening'
  | 'genetic_screening';

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
  ofa_screening: 'OFA Screening',
  genetic_screening: 'Genetic Screening',
};

const OFA_TEST_TYPES = [
  { value: 'hips', label: 'Hips' },
  { value: 'elbows', label: 'Elbows' },
  { value: 'eyes', label: 'Eyes' },
  { value: 'heart', label: 'Heart' },
  { value: 'patella', label: 'Patella' },
  { value: 'thyroid', label: 'Thyroid' },
];

const OFA_STATUSES = [
  { value: 'normal', label: 'Normal' },
  { value: 'carrier', label: 'Carrier' },
  { value: 'affected', label: 'Affected' },
  { value: 'pending', label: 'Pending' },
];

const GENETIC_PROVIDER_PRESETS = ['Embark', 'Wisdom Panel', 'Paw Print Genetics'];

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

  // OFA screening fields
  const [ofaTestType, setOfaTestType] = useState('hips');
  const [ofaTestDate, setOfaTestDate] = useState('');
  const [ofaResult, setOfaResult] = useState('');
  const [ofaCertNumber, setOfaCertNumber] = useState('');
  const [ofaStatus, setOfaStatus] = useState('pending');
  const [ofaVeterinarian, setOfaVeterinarian] = useState('');

  // Genetic screening fields
  const [geneticProvider, setGeneticProvider] = useState('');
  const [geneticTestDate, setGeneticTestDate] = useState('');
  const [geneticMarkers, setGeneticMarkers] = useState<
    Array<{ marker: string; result: string; status: string }>
  >([{ marker: '', result: '', status: 'clear' }]);

  const VACCINE_PRESETS = ['Rabies', 'DHPP', 'Bordetella', 'Leptospirosis'];

  const addMarkerRow = () => {
    setGeneticMarkers(prev => [...prev, { marker: '', result: '', status: 'clear' }]);
  };

  const removeMarkerRow = (index: number) => {
    setGeneticMarkers(prev => prev.filter((_, i) => i !== index));
  };

  const updateMarkerRow = (index: number, field: string, value: string) => {
    setGeneticMarkers(prev =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  };

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
    setOfaTestType('hips');
    setOfaTestDate('');
    setOfaResult('');
    setOfaCertNumber('');
    setOfaStatus('pending');
    setOfaVeterinarian('');
    setGeneticProvider('');
    setGeneticTestDate('');
    setGeneticMarkers([{ marker: '', result: '', status: 'clear' }]);
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
      case 'ofa_screening':
        data = {
          ...data,
          test_type: ofaTestType,
          test_date: ofaTestDate,
          result: ofaResult || undefined,
          certification_number: ofaCertNumber || undefined,
          status: ofaStatus,
          veterinarian: ofaVeterinarian || undefined,
          notes: notes || undefined,
        };
        break;
      case 'genetic_screening':
        data = {
          ...data,
          provider: geneticProvider,
          test_date: geneticTestDate,
          results: geneticMarkers.filter(m => m.marker.trim() !== ''),
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

        {type === 'ofa_screening' && (
          <>
            <div>
              <RequiredLabel required>Test Type</RequiredLabel>
              <select
                value={ofaTestType}
                onChange={e => setOfaTestType(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                required
              >
                {OFA_TEST_TYPES.map(t => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <DatePickerField
              label="Test Date"
              value={ofaTestDate}
              onChange={setOfaTestDate}
              required
            />
            <div>
              <RequiredLabel required>Status</RequiredLabel>
              <select
                value={ofaStatus}
                onChange={e => setOfaStatus(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                required
              >
                {OFA_STATUSES.map(s => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <RequiredLabel>Result</RequiredLabel>
              <Input
                value={ofaResult}
                onChange={e => setOfaResult(e.target.value)}
                placeholder="e.g., Good, Excellent, Fair"
              />
            </div>
            <div>
              <RequiredLabel>Certification Number</RequiredLabel>
              <Input
                value={ofaCertNumber}
                onChange={e => setOfaCertNumber(e.target.value)}
                placeholder="e.g., OFA-123456"
              />
            </div>
            <div>
              <RequiredLabel>Veterinarian</RequiredLabel>
              <Input
                value={ofaVeterinarian}
                onChange={e => setOfaVeterinarian(e.target.value)}
              />
            </div>
          </>
        )}

        {type === 'genetic_screening' && (
          <>
            <div>
              <RequiredLabel required>Provider</RequiredLabel>
              <Input
                value={geneticProvider}
                onChange={e => setGeneticProvider(e.target.value)}
                required
                placeholder="e.g., Embark"
              />
              <div className="flex gap-1 mt-2 flex-wrap">
                {GENETIC_PROVIDER_PRESETS.map(preset => (
                  <button
                    key={preset}
                    type="button"
                    className="text-xs px-2 py-1 rounded-full border hover:bg-muted transition-colors"
                    onClick={() => setGeneticProvider(preset)}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
            <DatePickerField
              label="Test Date"
              value={geneticTestDate}
              onChange={setGeneticTestDate}
              required
            />
            <div>
              <RequiredLabel>Marker Results</RequiredLabel>
              <div className="space-y-2">
                {geneticMarkers.map((row, index) => (
                  <div key={index} className="flex gap-2 items-start">
                    <Input
                      value={row.marker}
                      onChange={e => updateMarkerRow(index, 'marker', e.target.value)}
                      placeholder="Marker (e.g., DM)"
                      className="flex-1"
                    />
                    <Input
                      value={row.result}
                      onChange={e => updateMarkerRow(index, 'result', e.target.value)}
                      placeholder="Result"
                      className="flex-1"
                    />
                    <select
                      value={row.status}
                      onChange={e => updateMarkerRow(index, 'status', e.target.value)}
                      className="px-2 py-2 border rounded-md text-sm"
                    >
                      <option value="clear">Clear</option>
                      <option value="carrier">Carrier</option>
                      <option value="affected">Affected</option>
                      <option value="at_risk">At Risk</option>
                    </select>
                    {geneticMarkers.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeMarkerRow(index)}
                        className="px-2"
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addMarkerRow}>
                  <Plus className="h-3 w-3 mr-1" /> Add Marker
                </Button>
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
