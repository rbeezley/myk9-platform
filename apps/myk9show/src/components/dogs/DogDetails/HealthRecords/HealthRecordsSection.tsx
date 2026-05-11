import React, { useState, useMemo, useCallback, lazy, Suspense } from 'react';
import { HealthTimeline } from './HealthTimeline';
import { Button } from '@/components/ui/button';
import { Heart, Calendar, List, AlertTriangle } from 'lucide-react';
import type { HealthItemType } from './AddHealthItemDialog';
import {
  useDogHealthDataQuery,
  useVaccinationsQuery,
  useCreateVaccinationMutation,
  useCreateMedicationMutation,
  useCreateAllergyMutation,
  useCreateVetVisitMutation,
  useCreateOFAScreeningMutation,
  useCreateGeneticScreeningMutation,
  useUpdateVaccinationMutation,
  useUpdateMedicationMutation,
  useUpdateAllergyMutation,
  useUpdateVetVisitMutation,
} from '@/hooks/queries/useHealthDatabase';
import { useAuthContext } from '@/hooks/useAuthContext';
import type { HealthRecordsSectionProps } from './HealthRecordsSection.types';
import { dispatchHealthItem, importHealthRecords } from './HealthRecordsSection.types';
import { convertToTimelineEvents, getVaccinationAlerts } from './HealthRecordsSection.helpers';
import { HealthRecordsTraditionalView } from './HealthRecordsTraditionalView';
import type { HealthImportOutcome, ParsedHealthImportRow } from './healthImport';
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

const AddHealthItemDialog = lazy(() => import('./AddHealthItemDialog'));

const HealthRecordsSection: React.FC<HealthRecordsSectionProps> = ({
  user,
  dogId = '',
  vaccinationsOnly = false,
}) => {
  const [viewMode, setViewMode] = useState<'timeline' | 'traditional'>('timeline');
  const [addDialogType, setAddDialogType] = useState<HealthItemType | null>(null);
  const [editingVaccination, setEditingVaccination] = useState<VaccinationRecord | null>(null);
  const [editingMedication, setEditingMedication] = useState<MedicationRecord | null>(null);
  const [editingAllergy, setEditingAllergy] = useState<AllergyRecord | null>(null);
  const [editingVetVisit, setEditingVetVisit] = useState<VetVisitRecord | null>(null);
  const { user: authUser } = useAuthContext();

  const {
    vaccinations,
    medications,
    allergies,
    vetVisits,
    ofaScreenings,
    geneticScreenings,
    isLoading: isFullLoading,
    isError: isFullError,
    error: fullError,
  } = useDogHealthDataQuery(dogId, user.isPremium);

  // When vaccinationsOnly, use a scoped query that avoids RLS errors on
  // tables secretaries can't access (medications, allergies, vet_visits, etc.)
  const vaccinationsOnlyQuery = useVaccinationsQuery(vaccinationsOnly ? dogId : undefined);

  const isLoading = vaccinationsOnly ? vaccinationsOnlyQuery.isLoading : isFullLoading;
  const isError = vaccinationsOnly ? vaccinationsOnlyQuery.isError : isFullError;
  const error = vaccinationsOnly ? vaccinationsOnlyQuery.error : fullError;

  const createVaccination = useCreateVaccinationMutation();
  const createMedication = useCreateMedicationMutation();
  const createAllergy = useCreateAllergyMutation();
  const createVetVisit = useCreateVetVisitMutation();
  const createOFAScreening = useCreateOFAScreeningMutation();
  const createGeneticScreening = useCreateGeneticScreeningMutation();
  const updateVaccination = useUpdateVaccinationMutation();
  const updateMedication = useUpdateMedicationMutation();
  const updateAllergy = useUpdateAllergyMutation();
  const updateVetVisit = useUpdateVetVisitMutation();

  const vaccinationsData = useMemo(
    () => (vaccinationsOnly ? vaccinationsOnlyQuery.data : vaccinations.data) || [],
    [vaccinationsOnly, vaccinationsOnlyQuery.data, vaccinations.data]
  );
  const medicationsData = useMemo(() => medications.data || [], [medications.data]);
  const allergiesData = useMemo(() => allergies.data || [], [allergies.data]);
  const vetVisitsData = useMemo(() => vetVisits.data || [], [vetVisits.data]);
  const ofaScreeningsData = useMemo(() => ofaScreenings.data || [], [ofaScreenings.data]);
  const geneticScreeningsData = useMemo(
    () => geneticScreenings.data || [],
    [geneticScreenings.data]
  );

  const vaccinationAlerts = useMemo(
    () => getVaccinationAlerts(vaccinationsData),
    [vaccinationsData]
  );

  // Pre-compute dates for vaccination status badges (avoid Date.now() during render)
  const now = useMemo(() => new Date(), []);
  const thirtyDaysFromNow = useMemo(
    () => new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    [now]
  );

  const timelineEvents = useMemo(
    () =>
      convertToTimelineEvents(
        vaccinationsData,
        vetVisitsData,
        medicationsData,
        allergiesData,
        ofaScreeningsData,
        geneticScreeningsData
      ),
    [
      vaccinationsData,
      vetVisitsData,
      medicationsData,
      allergiesData,
      ofaScreeningsData,
      geneticScreeningsData,
    ]
  );

  const mutations = useMemo(
    () => ({
      createVaccination,
      createMedication,
      createAllergy,
      createVetVisit,
      createOFAScreening,
      createGeneticScreening,
    }),
    [
      createVaccination,
      createMedication,
      createAllergy,
      createVetVisit,
      createOFAScreening,
      createGeneticScreening,
    ]
  );

  const handleAddItem = useCallback(
    (type: HealthItemType, data: Record<string, unknown>) => {
      dispatchHealthItem(type, data, mutations, authUser?.id);
    },
    [mutations, authUser?.id]
  );

  const handleImportRecords = useCallback(
    async (records: ParsedHealthImportRow[]): Promise<HealthImportOutcome> => {
      return importHealthRecords(records, mutations, authUser?.id);
    },
    [mutations, authUser?.id]
  );

  const handleSaveVaccination = useCallback(
    (record: VaccinationRecord) => {
      updateVaccination.mutate(
        { id: record.id, updates: record },
        { onSuccess: () => setEditingVaccination(null) }
      );
    },
    [updateVaccination]
  );

  const handleSaveMedication = useCallback(
    (record: MedicationRecord) => {
      updateMedication.mutate(
        { id: record.id, updates: record },
        { onSuccess: () => setEditingMedication(null) }
      );
    },
    [updateMedication]
  );

  const handleSaveAllergy = useCallback(
    (record: AllergyRecord) => {
      updateAllergy.mutate(
        { id: record.id, updates: record },
        { onSuccess: () => setEditingAllergy(null) }
      );
    },
    [updateAllergy]
  );

  const handleSaveVetVisit = useCallback(
    (record: VetVisitRecord) => {
      updateVetVisit.mutate(
        { id: record.id, updates: record },
        { onSuccess: () => setEditingVetVisit(null) }
      );
    },
    [updateVetVisit]
  );

  if (!user.isPremium && !vaccinationsOnly) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Heart className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Health Records</h3>
        <p className="text-muted-foreground mb-4">
          Track vaccinations, vet visits, medications, and more with our enhanced timeline view.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="myk9-section-card">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading health records...</p>
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="myk9-section-card">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Heart className="h-12 w-12 text-muted-foreground mb-4 mx-auto" />
            <h3 className="text-lg font-semibold mb-2">Unable to load health records</h3>
            <p className="text-muted-foreground mb-4">
              {error?.message || 'There was an error loading the health records.'}
            </p>
            <Button onClick={() => window.location.reload()}>Try Again</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="myk9-section-card">
      {vaccinationAlerts.length > 0 && (
        <div className="mb-4 p-3 rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-800">
          <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-300">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-medium">Vaccination Reminders</span>
          </div>
          <ul className="mt-1 space-y-1">
            {vaccinationAlerts.map(v => {
              const exp = new Date(v.expiration_date!);
              const isOverdue = exp < new Date();
              return (
                <li
                  key={v.id}
                  className={`text-sm ${isOverdue ? 'text-red-600 dark:text-red-400' : 'text-yellow-700 dark:text-yellow-400'}`}
                >
                  {v.vaccine_name} — {isOverdue ? 'overdue since' : 'due'}{' '}
                  {exp.toLocaleDateString()}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="myk9-section-title flex items-center gap-2">
            <Heart className="h-5 w-5" />
            Health Records
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Track your dog&apos;s health history and upcoming care needs
          </p>
        </div>
        {!vaccinationsOnly && (
          <div className="flex gap-2">
            <Button
              variant={viewMode === 'timeline' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('timeline')}
            >
              <Calendar className="h-4 w-4 mr-2" />
              Timeline View
            </Button>
            <Button
              variant={viewMode === 'traditional' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('traditional')}
            >
              <List className="h-4 w-4 mr-2" />
              Traditional View
            </Button>
          </div>
        )}
      </div>

      {viewMode === 'timeline' ? (
        <HealthTimeline
          dogId={dogId}
          events={timelineEvents}
          onEventClick={() => {}}
          onAddEvent={() => setAddDialogType('vaccination')}
          onImportRecords={handleImportRecords}
          vaccinationsOnly={vaccinationsOnly}
        />
      ) : (
        <HealthRecordsTraditionalView
          vaccinationsData={vaccinationsData}
          vetVisitsData={vetVisitsData}
          medicationsData={medicationsData}
          allergiesData={allergiesData}
          ofaScreeningsData={ofaScreeningsData}
          geneticScreeningsData={geneticScreeningsData}
          vaccinationAlerts={vaccinationAlerts}
          now={now}
          thirtyDaysFromNow={thirtyDaysFromNow}
          onAddItem={setAddDialogType}
          onEditVaccination={setEditingVaccination}
          onEditMedication={setEditingMedication}
          onEditAllergy={setEditingAllergy}
          onEditVetVisit={setEditingVetVisit}
        />
      )}

      {addDialogType && (
        <Suspense fallback={null}>
          <AddHealthItemDialog
            open={!!addDialogType}
            type={addDialogType}
            dogId={dogId}
            onClose={() => setAddDialogType(null)}
            onAdd={handleAddItem}
          />
        </Suspense>
      )}

      {editingVaccination && (
        <EditVaccinationDialog
          key={editingVaccination.id}
          open
          record={editingVaccination}
          onClose={() => setEditingVaccination(null)}
          onSave={handleSaveVaccination}
        />
      )}
      {editingMedication && (
        <EditMedicationDialog
          key={editingMedication.id}
          open
          record={editingMedication}
          onClose={() => setEditingMedication(null)}
          onSave={handleSaveMedication}
        />
      )}
      {editingAllergy && (
        <EditAllergyDialog
          key={editingAllergy.id}
          open
          record={editingAllergy}
          onClose={() => setEditingAllergy(null)}
          onSave={handleSaveAllergy}
        />
      )}
      {editingVetVisit && (
        <EditVetVisitDialog
          key={editingVetVisit.id}
          open
          record={editingVetVisit}
          onClose={() => setEditingVetVisit(null)}
          onSave={handleSaveVetVisit}
        />
      )}
    </div>
  );
};

export default HealthRecordsSection;
