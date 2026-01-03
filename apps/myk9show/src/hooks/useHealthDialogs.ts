import { useState } from 'react';
import type { VaccinationRecord, VetVisitRecord, MedicationRecord, AllergyRecord } from '../types/health';

export interface HealthDialogsState {
  addVaccOpen: boolean;
  editVacc: VaccinationRecord | null;
  detailsVacc: VaccinationRecord | null;
  deleteVacc: VaccinationRecord | null;
  addVisitOpen: boolean;
  editVisit: VetVisitRecord | null;
  detailsVisit: VetVisitRecord | null;
  deleteVisit: VetVisitRecord | null;
  addMedOpen: boolean;
  editMed: MedicationRecord | null;
  detailsMed: MedicationRecord | null;
  deleteMed: MedicationRecord | null;
  addAllergyOpen: boolean;
  editAllergy: AllergyRecord | null;
  detailsAllergy: AllergyRecord | null;
  deleteAllergy: AllergyRecord | null;
}

export function useHealthDialogs(initial?: Partial<HealthDialogsState>) {
  const [dialogs, setDialogs] = useState<HealthDialogsState>({
    addVaccOpen: false,
    editVacc: null,
    detailsVacc: null,
    deleteVacc: null,
    addVisitOpen: false,
    editVisit: null,
    detailsVisit: null,
    deleteVisit: null,
    addMedOpen: false,
    editMed: null,
    detailsMed: null,
    deleteMed: null,
    addAllergyOpen: false,
    editAllergy: null,
    detailsAllergy: null,
    deleteAllergy: null,
    ...initial,
  });

  // Setter helpers for each dialog/modal state
  const setAddVaccOpen = (v: boolean) => setDialogs(d => ({ ...d, addVaccOpen: v }));
  const setEditVacc = (v: VaccinationRecord | null) => setDialogs(d => ({ ...d, editVacc: v }));
  const setDetailsVacc = (v: VaccinationRecord | null) => setDialogs(d => ({ ...d, detailsVacc: v }));
  const setDeleteVacc = (v: VaccinationRecord | null) => setDialogs(d => ({ ...d, deleteVacc: v }));
  const setAddVisitOpen = (v: boolean) => setDialogs(d => ({ ...d, addVisitOpen: v }));
  const setEditVisit = (v: VetVisitRecord | null) => setDialogs(d => ({ ...d, editVisit: v }));
  const setDetailsVisit = (v: VetVisitRecord | null) => setDialogs(d => ({ ...d, detailsVisit: v }));
  const setDeleteVisit = (v: VetVisitRecord | null) => setDialogs(d => ({ ...d, deleteVisit: v }));
  const setAddMedOpen = (v: boolean) => setDialogs(d => ({ ...d, addMedOpen: v }));
  const setEditMed = (v: MedicationRecord | null) => setDialogs(d => ({ ...d, editMed: v }));
  const setDetailsMed = (v: MedicationRecord | null) => setDialogs(d => ({ ...d, detailsMed: v }));
  const setDeleteMed = (v: MedicationRecord | null) => setDialogs(d => ({ ...d, deleteMed: v }));
  const setAddAllergyOpen = (v: boolean) => setDialogs(d => ({ ...d, addAllergyOpen: v }));
  const setEditAllergy = (v: AllergyRecord | null) => setDialogs(d => ({ ...d, editAllergy: v }));
  const setDetailsAllergy = (v: AllergyRecord | null) => setDialogs(d => ({ ...d, detailsAllergy: v }));
  const setDeleteAllergy = (v: AllergyRecord | null) => setDialogs(d => ({ ...d, deleteAllergy: v }));

  return {
    ...dialogs,
    setAddVaccOpen,
    setEditVacc,
    setDetailsVacc,
    setDeleteVacc,
    setAddVisitOpen,
    setEditVisit,
    setDetailsVisit,
    setDeleteVisit,
    setAddMedOpen,
    setEditMed,
    setDetailsMed,
    setDeleteMed,
    setAddAllergyOpen,
    setEditAllergy,
    setDetailsAllergy,
    setDeleteAllergy,
  };
}
