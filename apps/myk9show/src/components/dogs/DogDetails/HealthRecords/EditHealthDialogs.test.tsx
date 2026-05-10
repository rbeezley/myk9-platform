import { describe, expect, it, vi } from 'vitest';
import { screen } from '@/test/utils/testUtils';
import { render } from '@/test/utils/testUtils';
import EditVaccinationDialog from './Vaccinations/EditVaccinationDialog';
import EditMedicationDialog from './Medications/EditMedicationDialog';
import EditAllergyDialog from './Allergies/EditAllergyDialog';
import EditVetVisitDialog from './VetVisits/EditVetVisitDialog';
import type {
  AllergyRecord,
  MedicationRecord,
  VaccinationRecord,
  VetVisitRecord,
} from '@/types/health';

describe('health edit dialogs', () => {
  it('saves vaccinations with live health field names', async () => {
    const onSave = vi.fn();
    const record: VaccinationRecord = {
      id: 'vacc-1',
      dog_id: 'dog-1',
      vaccine_name: 'Rabies',
      date_given: '2026-01-10',
      expiration_date: '2027-01-10',
      vet_name: 'Dr. Old',
      created_at: '2026-01-10T00:00:00Z',
      updated_at: '2026-01-10T00:00:00Z',
    };

    const { user } = render(
      <EditVaccinationDialog open record={record} onClose={vi.fn()} onSave={onSave} />
    );

    await user.clear(screen.getByRole('textbox', { name: /vaccination/i }));
    await user.type(screen.getByRole('textbox', { name: /vaccination/i }), 'DHPP');
    await user.clear(screen.getByLabelText(/veterinarian/i));
    await user.type(screen.getByLabelText(/veterinarian/i), 'Dr. New');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'vacc-1',
        vaccine_name: 'DHPP',
        date_given: '2026-01-10',
        expiration_date: '2027-01-10',
        vet_name: 'Dr. New',
      })
    );
  });

  it('saves medications with live health field names', async () => {
    const onSave = vi.fn();
    const record: MedicationRecord = {
      id: 'med-1',
      dog_id: 'dog-1',
      medication_name: 'Carprofen',
      dosage: '25mg',
      frequency: 'Daily',
      start_date: '2026-01-10',
      end_date: '2026-01-20',
      notes: 'With food',
      created_at: '2026-01-10T00:00:00Z',
      updated_at: '2026-01-10T00:00:00Z',
    };

    const { user } = render(
      <EditMedicationDialog open record={record} onClose={vi.fn()} onSave={onSave} />
    );

    await user.clear(screen.getByLabelText(/name/i));
    await user.type(screen.getByLabelText(/name/i), 'Apoquel');
    await user.clear(screen.getByLabelText(/dosage/i));
    await user.type(screen.getByLabelText(/dosage/i), '16mg');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'med-1',
        medication_name: 'Apoquel',
        dosage: '16mg',
        frequency: 'Daily',
        start_date: '2026-01-10',
        end_date: '2026-01-20',
      })
    );
  });

  it('saves allergies with live health field names', async () => {
    const onSave = vi.fn();
    const record: AllergyRecord = {
      id: 'allergy-1',
      dog_id: 'dog-1',
      allergen: 'Chicken',
      reaction: 'Itchy skin',
      severity: 'moderate',
      discovered_date: '2026-01-10',
      created_at: '2026-01-10T00:00:00Z',
      updated_at: '2026-01-10T00:00:00Z',
    };

    const { user } = render(
      <EditAllergyDialog open record={record} onClose={vi.fn()} onSave={onSave} />
    );

    await user.clear(screen.getByLabelText(/allergy name/i));
    await user.type(screen.getByLabelText(/allergy name/i), 'Beef');
    await user.clear(screen.getByLabelText(/reaction/i));
    await user.type(screen.getByLabelText(/reaction/i), 'Upset stomach');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'allergy-1',
        allergen: 'Beef',
        reaction: 'Upset stomach',
        severity: 'moderate',
        discovered_date: '2026-01-10',
      })
    );
  });

  it('saves vet visits with live health field names', async () => {
    const onSave = vi.fn();
    const record: VetVisitRecord = {
      id: 'visit-1',
      dog_id: 'dog-1',
      visit_date: '2026-01-10',
      reason: 'Annual checkup',
      diagnosis: 'Healthy',
      treatment: 'None',
      vet_name: 'Dr. Old',
      clinic_name: 'Old Clinic',
      notes: 'Routine',
      created_at: '2026-01-10T00:00:00Z',
      updated_at: '2026-01-10T00:00:00Z',
    };

    const { user } = render(
      <EditVetVisitDialog open record={record} onClose={vi.fn()} onSave={onSave} />
    );

    await user.clear(screen.getByLabelText(/reason/i));
    await user.type(screen.getByLabelText(/reason/i), 'Follow-up');
    await user.clear(screen.getByLabelText(/vet name/i));
    await user.type(screen.getByLabelText(/vet name/i), 'Dr. New');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'visit-1',
        visit_date: '2026-01-10',
        reason: 'Follow-up',
        diagnosis: 'Healthy',
        treatment: 'None',
        vet_name: 'Dr. New',
        clinic_name: 'Old Clinic',
      })
    );
  });
});
