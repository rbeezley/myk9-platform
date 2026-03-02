import React, { useState, useMemo } from 'react';
import { HealthTimeline, type HealthEvent } from './HealthTimeline';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Heart, Calendar, List, Plus } from 'lucide-react';
import type { VaccinationRecord, VetVisitRecord, MedicationRecord, AllergyRecord } from '../../../../types/health';
import { useDogHealthDataQuery } from '@/hooks/queries/useHealthDatabase';
import { logger } from '@/services/LoggingService';

interface HealthRecordsSectionProps {
  user: { isPremium: boolean };
  dogId?: string;
}

// Convert health records to timeline events
const convertToTimelineEvents = (
  vaccinations: VaccinationRecord[],
  vetVisits: VetVisitRecord[],
  medications: MedicationRecord[],
  allergies: AllergyRecord[]
) => {
  const events: HealthEvent[] = [];

  // Add vaccinations
  vaccinations.forEach(vacc => {
    events.push({
      id: `vacc-${vacc.id}`,
      type: 'vaccination' as const,
      title: `${vacc.vaccine_name} Vaccination`,
      description: `Administered by ${vacc.vet_name || 'Unknown'}`,
      date: new Date(vacc.date_given),
      vetName: vacc.vet_name || '',
      clinic: vacc.clinic_name || '',
      status: vacc.expiration_date && new Date(vacc.expiration_date) < new Date() ? 'overdue' : 'completed',
      expiration: vacc.expiration_date ? new Date(vacc.expiration_date) : undefined,
      notes: vacc.notes || '',
      attachments: []
    });
  });

  // Add vet visits
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
      attachments: []
    });
  });

  // Add medications
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
      attachments: []
    });
  });

  // Add allergies
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
      attachments: []
    });
  });

  return events.sort((a, b) => b.date.getTime() - a.date.getTime());
};

const HealthRecordsSection: React.FC<HealthRecordsSectionProps> = ({ user, dogId = '' }) => {
  const [viewMode, setViewMode] = useState<'timeline' | 'traditional'>('timeline');
  
  // Use database hooks instead of mock data
  const {
    vaccinations,
    medications, 
    allergies,
    vetVisits,
    isLoading,
    isError,
    error,
  } = useDogHealthDataQuery(dogId, user.isPremium);

  const vaccinationsData = useMemo(() => vaccinations.data || [], [vaccinations.data]);
  const medicationsData = useMemo(() => medications.data || [], [medications.data]);
  const allergiesData = useMemo(() => allergies.data || [], [allergies.data]);
  const vetVisitsData = useMemo(() => vetVisits.data || [], [vetVisits.data]);

  const timelineEvents = useMemo(() => 
    convertToTimelineEvents(vaccinationsData, vetVisitsData, medicationsData, allergiesData),
    [vaccinationsData, vetVisitsData, medicationsData, allergiesData]
  );

  const handleEventClick = (event: HealthEvent) => {
    logger.debug('Event clicked:', 'dogs', { data: event });
    // In real app, this would open detailed view/edit dialog
  };

  const handleAddEvent = () => {
    logger.debug('Add new health event', 'dogs', {});
    // In real app, this would open add health record dialog
  };

  if (!user.isPremium) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Heart className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Health Records</h3>
        <p className="text-muted-foreground mb-4">
          Track vaccinations, vet visits, medications, and more with our enhanced timeline view.
        </p>
        <Button onClick={() => logger.debug('Upgrade to Premium', 'dogs')}>
          Upgrade to Premium
        </Button>
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
            <Button onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="myk9-section-card">
      {/* View Toggle */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="myk9-section-title flex items-center gap-2">
            <Heart className="h-5 w-5" />
            Health Records
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Track your dog's health history and upcoming care needs
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
          dogId="current-dog"
          events={timelineEvents}
          onEventClick={handleEventClick}
          onAddEvent={handleAddEvent}
        />
      ) : (
        <Tabs defaultValue="vetVisits" className="w-full">
          <TabsList className="myk9-sub-tabs">
            <TabsTrigger value="vetVisits" className="myk9-sub-tab">Vet Visits</TabsTrigger>
            <TabsTrigger value="vaccinations" className="myk9-sub-tab">Vaccinations</TabsTrigger>
            <TabsTrigger value="medications" className="myk9-sub-tab">Medications</TabsTrigger>
            <TabsTrigger value="allergies" className="myk9-sub-tab">Allergies</TabsTrigger>
          </TabsList>
          
          <TabsContent value="vetVisits" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Vet Visits</h3>
              <button className="myk9-add-button">
                <Plus className="h-4 w-4" />
                Add Vet Visit
              </button>
            </div>
            <div className="grid gap-4">
              {vetVisitsData.map(visit => (
                <div key={visit.id} className="p-4 border rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium">{visit.reason}</h4>
                      <p className="text-sm text-muted-foreground">
                        {new Date(visit.visit_date).toLocaleDateString()} • {visit.vet_name || 'Unknown'}
                      </p>
                      {visit.notes && (
                        <p className="text-sm mt-1">{visit.notes}</p>
                      )}
                    </div>
                    {visit.cost && (
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
              <button className="myk9-add-button">
                <Plus className="h-4 w-4" />
                Add Vaccination
              </button>
            </div>
            <div className="grid gap-4">
              {vaccinationsData.map(vacc => (
                <div key={vacc.id} className="p-4 border rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium">{vacc.vaccine_name}</h4>
                      <p className="text-sm text-muted-foreground">
                        Given: {new Date(vacc.date_given).toLocaleDateString()}
                      </p>
                      {vacc.expiration_date && (
                        <p className="text-sm text-muted-foreground">
                          Next Due: {new Date(vacc.expiration_date).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {vacc.vet_name || 'Unknown'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
          
          <TabsContent value="medications" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Medications</h3>
              <button className="myk9-add-button">
                <Plus className="h-4 w-4" />
                Add Medication
              </button>
            </div>
            <div className="grid gap-4">
              {medicationsData.map(med => (
                <div key={med.id} className="p-4 border rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium">{med.medication_name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {med.dosage} • {med.frequency}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {med.notes}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {med.frequency}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
          
          <TabsContent value="allergies" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Allergies</h3>
              <button className="myk9-add-button">
                <Plus className="h-4 w-4" />
                Add Allergy
              </button>
            </div>
            <div className="grid gap-4">
              {allergiesData.map(allergy => (
                <div key={allergy.id} className="p-4 border rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium">{allergy.allergen}</h4>
                      <p className="text-sm text-muted-foreground">
                        {allergy.reaction || 'No description'}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Allergy
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default HealthRecordsSection;