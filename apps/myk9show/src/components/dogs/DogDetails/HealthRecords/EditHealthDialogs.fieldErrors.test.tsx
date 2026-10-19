import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
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

const stamp = { created_at: '2026-01-10T00:00:00Z', updated_at: '2026-01-10T00:00:00Z' };

const emptyMedication: MedicationRecord = {
  id: 'med-1',
  dog_id: 'dog-1',
  medication_name: '',
  dosage: '',
  ...stamp,
};
const emptyVaccination = {
  id: 'vacc-1',
  dog_id: 'dog-1',
  vaccine_name: '',
  date_given: '',
  vet_name: '',
  ...stamp,
} as unknown as VaccinationRecord;
const emptyVisit = {
  id: 'visit-1',
  dog_id: 'dog-1',
  visit_date: '',
  reason: '',
  vet_name: '',
  ...stamp,
} as unknown as VetVisitRecord;
const emptyAllergy: AllergyRecord = { id: 'a-1', dog_id: 'dog-1', allergen: '', ...stamp };

const save = () => screen.getByRole('button', { name: /^save$/i });

describe('health edit dialogs: required-field callouts', () => {
  it('medication: callout under each empty field, focus on the first, banner gone', async () => {
    const onSave = vi.fn();
    const { user } = render(
      <EditMedicationDialog open record={emptyMedication} onClose={vi.fn()} onSave={onSave} />
    );
    await user.click(save());

    expect(onSave).not.toHaveBeenCalled();
    const name = screen.getByLabelText(/^name/i);
    const dosage = screen.getByLabelText(/dosage/i);
    expect(screen.getByText('Enter the medication name.')).toBeInTheDocument();
    expect(screen.getByText('Enter the dosage.')).toBeInTheDocument();
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAttribute('aria-describedby', 'editMedicationName-error');
    expect(dosage).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveFocus();
    expect(screen.queryByText(/name and dosage are required/i)).not.toBeInTheDocument();

    await user.type(name, 'A');
    expect(screen.queryByText('Enter the medication name.')).not.toBeInTheDocument();
    expect(name).not.toHaveAttribute('aria-invalid');
    expect(screen.getByText('Enter the dosage.')).toBeInTheDocument();
  });

  it('vaccination: callouts for text and date fields, focus on the first', async () => {
    const onSave = vi.fn();
    const { user } = render(
      <EditVaccinationDialog open record={emptyVaccination} onClose={vi.fn()} onSave={onSave} />
    );
    await user.click(save());

    expect(onSave).not.toHaveBeenCalled();
    const vaccination = screen.getByRole('textbox', { name: /vaccination/i });
    expect(screen.getByText('Enter the vaccine name.')).toBeInTheDocument();
    expect(screen.getByText('Choose the date given.')).toBeInTheDocument();
    expect(screen.getByText('Choose the expiration date.')).toBeInTheDocument();
    expect(screen.getByText("Enter the veterinarian's name.")).toBeInTheDocument();
    expect(vaccination).toHaveAttribute('aria-invalid', 'true');
    expect(vaccination).toHaveFocus();
    const dateTrigger = document.getElementById('editVaccinationDate');
    expect(dateTrigger).toHaveAttribute('aria-invalid', 'true');
    expect(dateTrigger).toHaveAttribute('aria-describedby', 'editVaccinationDate-error');
    expect(screen.queryByText(/all fields are required\./i, { selector: 'p' })).toBeNull();

    await user.type(vaccination, 'R');
    expect(screen.queryByText('Enter the vaccine name.')).not.toBeInTheDocument();
  });

  it('vet visit: callouts under reason, date and vet name', async () => {
    const onSave = vi.fn();
    const { user } = render(
      <EditVetVisitDialog open record={emptyVisit} onClose={vi.fn()} onSave={onSave} />
    );
    await user.click(save());

    expect(onSave).not.toHaveBeenCalled();
    const reason = screen.getByLabelText(/reason/i);
    expect(screen.getByText('Enter the reason for the visit.')).toBeInTheDocument();
    expect(screen.getByText('Choose the visit date.')).toBeInTheDocument();
    expect(screen.getByText("Enter the vet's name.")).toBeInTheDocument();
    expect(reason).toHaveAttribute('aria-invalid', 'true');
    expect(reason).toHaveFocus();
    expect(document.getElementById('editVetVisitDate')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText(/reason, date, and vet name are required/i)).toBeNull();

    await user.type(reason, 'X');
    expect(screen.queryByText('Enter the reason for the visit.')).not.toBeInTheDocument();
  });

  it('allergy: callout under the allergy name, focused, cleared once filled', async () => {
    const onSave = vi.fn();
    const { user } = render(
      <EditAllergyDialog open record={emptyAllergy} onClose={vi.fn()} onSave={onSave} />
    );
    await user.click(save());

    expect(onSave).not.toHaveBeenCalled();
    const name = screen.getByLabelText(/allergy name/i);
    expect(screen.getByText('Enter the allergy name.')).toBeInTheDocument();
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveFocus();
    expect(screen.queryByText(/allergy name is required/i)).not.toBeInTheDocument();

    await user.type(name, 'B');
    await waitFor(() =>
      expect(screen.queryByText('Enter the allergy name.')).not.toBeInTheDocument()
    );
    await user.click(save());
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('keeps a server save failure in the banner, not beside a field', () => {
    render(
      <EditAllergyDialog
        open
        record={{ ...emptyAllergy, allergen: 'Beef' }}
        onClose={vi.fn()}
        onSave={vi.fn()}
        saveError="Network down."
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/network down\. the record was not saved/i);
  });
});
