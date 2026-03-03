import React, { useState, useMemo, lazy, Suspense } from 'react';
import { HealthTimeline, type HealthEvent } from './HealthTimeline';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Heart, Calendar, List, Plus, AlertTriangle } from 'lucide-react';
import type {
  VaccinationRecord,
  VetVisitRecord,
  MedicationRecord,
  AllergyRecord,
  OFAScreeningRecord,
  GeneticScreeningRecord,
} from '../../../../types/health';
import type { HealthItemType } from './AddHealthItemDialog';
import {
  useDogHealthDataQuery,
  useCreateVaccinationMutation,
  useCreateMedicationMutation,
  useCreateAllergyMutation,
  useCreateVetVisitMutation,
  useCreateOFAScreeningMutation,
  useCreateGeneticScreeningMutation,
} from '@/hooks/queries/useHealthDatabase';
import { useAuthContext } from '@/hooks/useAuthContext';

const AddHealthItemDialog = lazy(() => import('./AddHealthItemDialog'));

interface HealthRecordsSectionProps {
  user: { isPremium: boolean };
  dogId?: string;
}

// Status badge colors for OFA screenings
const ofaStatusColors: Record<string, string> = {
  normal: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  carrier: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  affected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  pending: 'bg-muted text-muted-foreground',
};

// Status badge colors for genetic marker statuses
const geneticStatusColors: Record<string, string> = {
  clear: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  carrier: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  affected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  at_risk: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
};

// Convert health records to timeline events
const convertToTimelineEvents = (
  vaccinations: VaccinationRecord[],
  vetVisits: VetVisitRecord[],
  medications: MedicationRecord[],
  allergies: AllergyRecord[],
  ofaScreenings: OFAScreeningRecord[],
  geneticScreenings: GeneticScreeningRecord[]
) => {
  const events: HealthEvent[] = [];

  vaccinations.forEach(vacc => {
    events.push({
      id: `vacc-${vacc.id}`,
      type: 'vaccination' as const,
      title: `${vacc.vaccine_name} Vaccination`,
      description: `Administered by ${vacc.vet_name || 'Unknown'}`,
      date: new Date(vacc.date_given),
      vetName: vacc.vet_name || '',
      clinic: vacc.clinic_name || '',
      status:
        vacc.expiration_date && new Date(vacc.expiration_date) < new Date()
          ? 'overdue'
          : 'completed',
      expiration: vacc.expiration_date ? new Date(vacc.expiration_date) : undefined,
      notes: vacc.notes || '',
      attachments: [],
    });
  });

  vetVisits.forEach(visit => {
    events.push({
      id: `visit-${visit.id}`,
      type: 'vet_visit' as const,
      title: visit.reason,
      description: visit.notes || 'Routine visit',
      date: new Date(visit.visit_date),
      vetName: visit.vet_name || '',
      clinic: visit.clinic_name || '',
      cost: visit.cost || 0,
      status: 'completed' as const,
      notes: visit.notes || '',
      attachments: [],
    });
  });

  medications.forEach(med => {
    events.push({
      id: `med-${med.id}`,
      type: 'medication' as const,
      title: med.medication_name,
      description: `${med.dosage || ''} - ${med.frequency || ''}`,
      date: med.start_date ? new Date(med.start_date) : new Date(),
      vetName: med.frequency || '',
      status: 'scheduled' as const,
      notes: med.notes || '',
      attachments: [],
    });
  });

  allergies.forEach(allergy => {
    events.push({
      id: `allergy-${allergy.id}`,
      type: 'allergy' as const,
      title: `${allergy.allergen} Allergy`,
      description: allergy.reaction || '',
      date: allergy.discovered_date ? new Date(allergy.discovered_date) : new Date(),
      vetName: allergy.discovered_by || '',
      status: 'completed' as const,
      notes: allergy.reaction || '',
      attachments: [],
    });
  });

  ofaScreenings.forEach(ofa => {
    events.push({
      id: `ofa-${ofa.id}`,
      type: 'vaccination' as const, // Reuse closest timeline icon type
      title: `OFA ${ofa.test_type.charAt(0).toUpperCase() + ofa.test_type.slice(1)} Screening`,
      description: `Status: ${ofa.status}${ofa.result ? ` — ${ofa.result}` : ''}`,
      date: new Date(ofa.test_date),
      vetName: ofa.veterinarian || '',
      status: ofa.status === 'pending' ? 'scheduled' : 'completed',
      notes: ofa.notes || '',
      attachments: [],
    });
  });

  geneticScreenings.forEach(gen => {
    const markerCount = gen.results.length;
    events.push({
      id: `genetic-${gen.id}`,
      type: 'vaccination' as const, // Reuse closest timeline icon type
      title: `${gen.provider} Genetic Test`,
      description: `${markerCount} marker${markerCount !== 1 ? 's' : ''} tested`,
      date: new Date(gen.test_date),
      vetName: gen.provider,
      status: 'completed' as const,
      notes: gen.notes || '',
      attachments: [],
    });
  });

  return events.sort((a, b) => b.date.getTime() - a.date.getTime());
};

// Check for upcoming/overdue vaccinations
const getVaccinationAlerts = (vaccinations: VaccinationRecord[]) => {
  const now = new Date();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(now.getDate() + 30);

  return vaccinations.filter(v => {
    if (!v.expiration_date) return false;
    const exp = new Date(v.expiration_date);
    return exp <= thirtyDaysFromNow;
  });
};

const HealthRecordsSection: React.FC<HealthRecordsSectionProps> = ({ user, dogId = '' }) => {
  const [viewMode, setViewMode] = useState<'timeline' | 'traditional'>('timeline');
  const [addDialogType, setAddDialogType] = useState<HealthItemType | null>(null);

  const { user: authUser } = useAuthContext();

  const {
    vaccinations,
    medications,
    allergies,
    vetVisits,
    ofaScreenings,
    geneticScreenings,
    isLoading,
    isError,
    error,
  } = useDogHealthDataQuery(dogId, user.isPremium);

  const createVaccination = useCreateVaccinationMutation();
  const createMedication = useCreateMedicationMutation();
  const createAllergy = useCreateAllergyMutation();
  const createVetVisit = useCreateVetVisitMutation();
  const createOFAScreening = useCreateOFAScreeningMutation();
  const createGeneticScreening = useCreateGeneticScreeningMutation();

  const vaccinationsData = useMemo(() => vaccinations.data || [], [vaccinations.data]);
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

  const handleAddItem = (type: HealthItemType, data: Record<string, unknown>) => {
    const ownerId = authUser?.id;
    switch (type) {
      case 'vaccination':
        createVaccination.mutate({
          dog_id: data.dog_id as string,
          vaccine_name: data.vaccine_name as string,
          date_given: data.date_given as string,
          expiration_date: (data.expiration_date as string) || undefined,
          vet_name: (data.vet_name as string) || undefined,
          lot_number: (data.lot_number as string) || undefined,
          notes: (data.notes as string) || undefined,
        });
        break;
      case 'medication':
        createMedication.mutate({
          dog_id: data.dog_id as string,
          medication_name: data.medication_name as string,
          dosage: (data.dosage as string) || undefined,
          frequency: (data.frequency as string) || undefined,
          start_date: (data.start_date as string) || undefined,
          end_date: (data.end_date as string) || undefined,
          is_active: true,
          notes: (data.notes as string) || undefined,
        });
        break;
      case 'allergy':
        createAllergy.mutate({
          dog_id: data.dog_id as string,
          allergen: data.allergen as string,
          reaction: (data.reaction as string) || undefined,
          severity:
            (data.severity as 'mild' | 'moderate' | 'severe' | 'life_threatening') || undefined,
          discovered_date: (data.discovered_date as string) || undefined,
          notes: (data.notes as string) || undefined,
        });
        break;
      case 'vet_visit':
        createVetVisit.mutate({
          dog_id: data.dog_id as string,
          visit_date: data.visit_date as string,
          reason: data.reason as string,
          diagnosis: (data.diagnosis as string) || undefined,
          treatment: (data.treatment as string) || undefined,
          vet_name: (data.vet_name as string) || undefined,
          cost: data.cost as number | undefined,
          notes: (data.notes as string) || undefined,
        });
        break;
      case 'ofa_screening':
        if (!ownerId) break;
        createOFAScreening.mutate({
          dog_id: data.dog_id as string,
          owner_id: ownerId,
          test_type: data.test_type as OFAScreeningRecord['test_type'],
          test_date: data.test_date as string,
          result: (data.result as string) || undefined,
          certification_number: (data.certification_number as string) || undefined,
          status: data.status as OFAScreeningRecord['status'],
          veterinarian: (data.veterinarian as string) || undefined,
          notes: (data.notes as string) || undefined,
        });
        break;
      case 'genetic_screening':
        if (!ownerId) break;
        createGeneticScreening.mutate({
          dog_id: data.dog_id as string,
          owner_id: ownerId,
          provider: data.provider as string,
          test_date: data.test_date as string,
          results: data.results as GeneticScreeningRecord['results'],
          notes: (data.notes as string) || undefined,
        });
        break;
    }
  };

  if (!user.isPremium) {
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
      {/* Vaccination Alerts */}
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

      {/* View Toggle */}
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
      </div>

      {viewMode === 'timeline' ? (
        <HealthTimeline
          dogId={dogId}
          events={timelineEvents}
          onEventClick={() => {}}
          onAddEvent={() => setAddDialogType('vaccination')}
        />
      ) : (
        <Tabs defaultValue="vetVisits" className="w-full">
          <TabsList className="myk9-sub-tabs">
            <TabsTrigger value="vetVisits" className="myk9-sub-tab">
              Vet Visits
            </TabsTrigger>
            <TabsTrigger value="vaccinations" className="myk9-sub-tab">
              Vaccinations
              {vaccinationAlerts.length > 0 && (
                <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-yellow-500 text-[10px] font-bold text-white">
                  {vaccinationAlerts.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="medications" className="myk9-sub-tab">
              Medications
            </TabsTrigger>
            <TabsTrigger value="allergies" className="myk9-sub-tab">
              Allergies
            </TabsTrigger>
            <TabsTrigger value="ofaScreenings" className="myk9-sub-tab">
              OFA Screenings
            </TabsTrigger>
            <TabsTrigger value="geneticScreenings" className="myk9-sub-tab">
              Genetic Tests
            </TabsTrigger>
          </TabsList>

          <TabsContent value="vetVisits" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Vet Visits</h3>
              <Button size="sm" onClick={() => setAddDialogType('vet_visit')}>
                <Plus className="h-4 w-4 mr-1" />
                Add Vet Visit
              </Button>
            </div>
            <div className="grid gap-4">
              {vetVisitsData.length === 0 && (
                <p className="text-muted-foreground text-sm py-4 text-center">
                  No vet visits recorded yet.
                </p>
              )}
              {vetVisitsData.map(visit => (
                <div key={visit.id} className="p-4 border rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium">{visit.reason}</h4>
                      <p className="text-sm text-muted-foreground">
                        {new Date(visit.visit_date).toLocaleDateString()} &bull;{' '}
                        {visit.vet_name || 'Unknown'}
                      </p>
                      {visit.notes && <p className="text-sm mt-1">{visit.notes}</p>}
                    </div>
                    {visit.cost != null && visit.cost > 0 && (
                      <span className="text-sm font-medium">${visit.cost}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="vaccinations" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Vaccinations</h3>
              <Button size="sm" onClick={() => setAddDialogType('vaccination')}>
                <Plus className="h-4 w-4 mr-1" />
                Add Vaccination
              </Button>
            </div>
            <div className="grid gap-4">
              {vaccinationsData.length === 0 && (
                <p className="text-muted-foreground text-sm py-4 text-center">
                  No vaccinations recorded yet.
                </p>
              )}
              {vaccinationsData.map(vacc => {
                const isExpiringSoon =
                  vacc.expiration_date && new Date(vacc.expiration_date) <= thirtyDaysFromNow;
                const isOverdue = vacc.expiration_date && new Date(vacc.expiration_date) < now;
                return (
                  <div
                    key={vacc.id}
                    className={`p-4 border rounded-lg ${isOverdue ? 'border-red-300 bg-red-50 dark:bg-red-950/10' : isExpiringSoon ? 'border-yellow-300 bg-yellow-50 dark:bg-yellow-950/10' : ''}`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium">{vacc.vaccine_name}</h4>
                        <p className="text-sm text-muted-foreground">
                          Given: {new Date(vacc.date_given).toLocaleDateString()}
                        </p>
                        {vacc.expiration_date && (
                          <p
                            className={`text-sm ${isOverdue ? 'text-red-600 font-medium' : isExpiringSoon ? 'text-yellow-600 font-medium' : 'text-muted-foreground'}`}
                          >
                            {isOverdue ? 'Overdue since' : 'Next Due'}:{' '}
                            {new Date(vacc.expiration_date).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {vacc.vet_name || 'Unknown'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="medications" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Medications</h3>
              <Button size="sm" onClick={() => setAddDialogType('medication')}>
                <Plus className="h-4 w-4 mr-1" />
                Add Medication
              </Button>
            </div>
            <div className="grid gap-4">
              {medicationsData.length === 0 && (
                <p className="text-muted-foreground text-sm py-4 text-center">
                  No medications recorded yet.
                </p>
              )}
              {medicationsData.map(med => (
                <div key={med.id} className="p-4 border rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium">{med.medication_name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {med.dosage} &bull; {med.frequency}
                      </p>
                      {med.notes && <p className="text-sm text-muted-foreground">{med.notes}</p>}
                    </div>
                    {med.is_active && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                        Active
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="allergies" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Allergies</h3>
              <Button size="sm" onClick={() => setAddDialogType('allergy')}>
                <Plus className="h-4 w-4 mr-1" />
                Add Allergy
              </Button>
            </div>
            <div className="grid gap-4">
              {allergiesData.length === 0 && (
                <p className="text-muted-foreground text-sm py-4 text-center">
                  No allergies recorded yet.
                </p>
              )}
              {allergiesData.map(allergy => (
                <div key={allergy.id} className="p-4 border rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium">{allergy.allergen}</h4>
                      <p className="text-sm text-muted-foreground">
                        {allergy.reaction || 'No description'}
                      </p>
                    </div>
                    {allergy.severity && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          allergy.severity === 'life_threatening'
                            ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                            : allergy.severity === 'severe'
                              ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300'
                              : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {allergy.severity.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="ofaScreenings" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">OFA / Health Screenings</h3>
              <Button size="sm" onClick={() => setAddDialogType('ofa_screening')}>
                <Plus className="h-4 w-4 mr-1" />
                Add OFA Screening
              </Button>
            </div>
            <div className="grid gap-4">
              {ofaScreeningsData.length === 0 && (
                <p className="text-muted-foreground text-sm py-4 text-center">
                  No OFA screenings recorded yet.
                </p>
              )}
              {ofaScreeningsData.map(ofa => (
                <div key={ofa.id} className="p-4 border rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium capitalize">{ofa.test_type}</h4>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full capitalize ${ofaStatusColors[ofa.status] || 'bg-muted text-muted-foreground'}`}
                        >
                          {ofa.status}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {new Date(ofa.test_date).toLocaleDateString()}
                        {ofa.veterinarian ? ` \u2022 ${ofa.veterinarian}` : ''}
                      </p>
                      {ofa.result && (
                        <p className="text-sm mt-1">
                          Result: {ofa.result}
                        </p>
                      )}
                      {ofa.notes && (
                        <p className="text-sm text-muted-foreground mt-1">{ofa.notes}</p>
                      )}
                    </div>
                    {ofa.certification_number && (
                      <span className="text-xs font-mono text-muted-foreground">
                        {ofa.certification_number}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="geneticScreenings" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Genetic Tests</h3>
              <Button size="sm" onClick={() => setAddDialogType('genetic_screening')}>
                <Plus className="h-4 w-4 mr-1" />
                Add Genetic Test
              </Button>
            </div>
            <div className="grid gap-4">
              {geneticScreeningsData.length === 0 && (
                <p className="text-muted-foreground text-sm py-4 text-center">
                  No genetic screenings recorded yet.
                </p>
              )}
              {geneticScreeningsData.map(gen => (
                <div key={gen.id} className="p-4 border rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium">{gen.provider}</h4>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {gen.results.length} marker{gen.results.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {new Date(gen.test_date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  {gen.results.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {gen.results.map((marker, idx) => (
                        <span
                          key={idx}
                          className={`text-xs px-2 py-0.5 rounded-full ${geneticStatusColors[marker.status || ''] || 'bg-muted text-muted-foreground'}`}
                        >
                          {marker.marker}: {marker.result}
                        </span>
                      ))}
                    </div>
                  )}
                  {gen.notes && (
                    <p className="text-sm text-muted-foreground mt-2">{gen.notes}</p>
                  )}
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      )}

      {/* Add Health Item Dialog */}
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
    </div>
  );
};

export default HealthRecordsSection;
