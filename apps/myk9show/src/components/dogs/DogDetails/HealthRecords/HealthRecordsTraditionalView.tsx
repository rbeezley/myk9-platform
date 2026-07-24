/**
 * Traditional (tabbed) view for HealthRecordsSection
 */

import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { PrimaryTabs, PrimaryTabsContent } from '@/components/common/PrimaryTabs';
import type { PrimaryTabDef } from '@/components/common/PrimaryTabs';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type {
  VaccinationRecord,
  VetVisitRecord,
  MedicationRecord,
  AllergyRecord,
  OFAScreeningRecord,
  GeneticScreeningRecord,
} from '../../../../types/health';
import type { HealthItemType } from './AddHealthItemDialog';
import { ofaStatusColors, geneticStatusColors } from './HealthRecordsSection.types';
import { formatHealthDate, parseHealthDate } from './healthDateOnly';

interface TraditionalViewProps {
  vaccinationsData: VaccinationRecord[];
  vetVisitsData: VetVisitRecord[];
  medicationsData: MedicationRecord[];
  allergiesData: AllergyRecord[];
  ofaScreeningsData: OFAScreeningRecord[];
  geneticScreeningsData: GeneticScreeningRecord[];
  vaccinationAlerts: VaccinationRecord[];
  now: Date;
  thirtyDaysFromNow: Date;
  readOnly?: boolean;
  onAddItem: (type: HealthItemType) => void;
  onEditVaccination: (record: VaccinationRecord) => void;
  onEditMedication: (record: MedicationRecord) => void;
  onEditAllergy: (record: AllergyRecord) => void;
  onEditVetVisit: (record: VetVisitRecord) => void;
  onDeleteItem: (type: HealthItemType, id: string, title: string) => void;
}

export const HealthRecordsTraditionalView: React.FC<TraditionalViewProps> = ({
  vaccinationsData,
  vetVisitsData,
  medicationsData,
  allergiesData,
  ofaScreeningsData,
  geneticScreeningsData,
  vaccinationAlerts,
  now,
  thirtyDaysFromNow,
  readOnly = false,
  onAddItem,
  onEditVaccination,
  onEditMedication,
  onEditAllergy,
  onEditVetVisit,
  onDeleteItem,
}) => {
  const [activeTab, setActiveTab] = useState('vetVisits');

  const tabs: PrimaryTabDef[] = useMemo(
    () => [
      { id: 'vetVisits', label: 'Vet Visits' },
      { id: 'vaccinations', label: 'Vaccinations', badge: vaccinationAlerts.length },
      { id: 'medications', label: 'Medications' },
      { id: 'allergies', label: 'Allergies' },
      { id: 'ofaScreenings', label: 'OFA Screenings' },
      { id: 'geneticScreenings', label: 'Genetic Tests' },
    ],
    [vaccinationAlerts.length]
  );

  return (
    <PrimaryTabs tabs={tabs} value={activeTab} onValueChange={setActiveTab} className="w-full">
      <PrimaryTabsContent value="vetVisits" className="space-y-4">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <h3 className="text-lg font-semibold">Vet Visits</h3>
          {!readOnly && (
            <Button size="sm" onClick={() => onAddItem('vet_visit')}>
              <Plus className="h-4 w-4 mr-1" />
              Add Vet Visit
            </Button>
          )}
        </div>
        <div className="grid gap-4">
          {vetVisitsData.length === 0 && (
            <p className="text-muted-foreground text-sm py-4 text-center">
              No vet visits recorded yet.
            </p>
          )}
          {vetVisitsData.map(visit => (
            <div key={visit.id} className="p-4 border rounded-lg">
              <div className="flex flex-wrap justify-between items-start gap-2">
                <div>
                  <h4 className="font-medium">{visit.reason}</h4>
                  <p className="text-sm text-muted-foreground">
                    {formatHealthDate(visit.visit_date)} &bull; {visit.vet_name || 'Unknown'}
                  </p>
                  {visit.notes && <p className="text-sm mt-1">{visit.notes}</p>}
                </div>
                {visit.cost != null && visit.cost > 0 && (
                  <span className="text-sm font-medium">${visit.cost}</span>
                )}
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEditVetVisit(visit)}
                    aria-label={`Edit ${visit.reason}`}
                  >
                    <Pencil className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDeleteItem('vet_visit', visit.id, visit.reason)}
                  aria-label={`Delete ${visit.reason}`}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </PrimaryTabsContent>

      <PrimaryTabsContent value="vaccinations" className="space-y-4">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <h3 className="text-lg font-semibold">Vaccinations</h3>
          {!readOnly && (
            <Button size="sm" onClick={() => onAddItem('vaccination')}>
              <Plus className="h-4 w-4 mr-1" />
              Add Vaccination
            </Button>
          )}
        </div>
        <div className="grid gap-4">
          {vaccinationsData.length === 0 && (
            <p className="text-muted-foreground text-sm py-4 text-center">
              No vaccinations recorded yet.
            </p>
          )}
          {vaccinationsData.map(vacc => {
            const isExpiringSoon =
              vacc.expiration_date && parseHealthDate(vacc.expiration_date) <= thirtyDaysFromNow;
            const isOverdue = vacc.expiration_date && parseHealthDate(vacc.expiration_date) < now;
            return (
              <div
                key={vacc.id}
                className={`p-4 border rounded-lg ${isOverdue ? 'border-destructive/20 bg-destructive/10 ' : isExpiringSoon ? 'border-amber-300 bg-warning/10 ' : ''}`}
              >
                <div className="flex flex-wrap justify-between items-start gap-2">
                  <div>
                    <h4 className="font-medium">{vacc.vaccine_name}</h4>
                    <p className="text-sm text-muted-foreground">
                      Given: {formatHealthDate(vacc.date_given)}
                    </p>
                    {vacc.expiration_date && (
                      <p
                        className={`text-sm ${isOverdue ? 'text-destructive font-medium' : isExpiringSoon ? 'text-amber-600 font-medium' : 'text-muted-foreground'}`}
                      >
                        {isOverdue ? 'Overdue since' : 'Next Due'}:{' '}
                        {formatHealthDate(vacc.expiration_date)}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {vacc.vet_name || 'Unknown'}
                  </span>
                  {!readOnly && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEditVaccination(vacc)}
                      aria-label={`Edit ${vacc.vaccine_name}`}
                    >
                      <Pencil className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDeleteItem('vaccination', vacc.id, vacc.vaccine_name)}
                    aria-label={`Delete ${vacc.vaccine_name}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </PrimaryTabsContent>

      <PrimaryTabsContent value="medications" className="space-y-4">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <h3 className="text-lg font-semibold">Medications</h3>
          {!readOnly && (
            <Button size="sm" onClick={() => onAddItem('medication')}>
              <Plus className="h-4 w-4 mr-1" />
              Add Medication
            </Button>
          )}
        </div>
        <div className="grid gap-4">
          {medicationsData.length === 0 && (
            <p className="text-muted-foreground text-sm py-4 text-center">
              No medications recorded yet.
            </p>
          )}
          {medicationsData.map(med => (
            <div key={med.id} className="p-4 border rounded-lg">
              <div className="flex flex-wrap justify-between items-start gap-2">
                <div>
                  <h4 className="font-medium">{med.medication_name}</h4>
                  <p className="text-sm text-muted-foreground">
                    {med.dosage} &bull; {med.frequency}
                  </p>
                  {med.notes && <p className="text-sm text-muted-foreground">{med.notes}</p>}
                </div>
                {med.is_active && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success ">
                    Active
                  </span>
                )}
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEditMedication(med)}
                    aria-label={`Edit ${med.medication_name}`}
                  >
                    <Pencil className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDeleteItem('medication', med.id, med.medication_name)}
                  aria-label={`Delete ${med.medication_name}`}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </PrimaryTabsContent>

      <PrimaryTabsContent value="allergies" className="space-y-4">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <h3 className="text-lg font-semibold">Allergies</h3>
          {!readOnly && (
            <Button size="sm" onClick={() => onAddItem('allergy')}>
              <Plus className="h-4 w-4 mr-1" />
              Add Allergy
            </Button>
          )}
        </div>
        <div className="grid gap-4">
          {allergiesData.length === 0 && (
            <p className="text-muted-foreground text-sm py-4 text-center">
              No allergies recorded yet.
            </p>
          )}
          {allergiesData.map(allergy => (
            <div key={allergy.id} className="p-4 border rounded-lg">
              <div className="flex flex-wrap justify-between items-start gap-2">
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
                        ? 'bg-destructive/10 text-destructive '
                        : allergy.severity === 'severe'
                          ? 'bg-warning/10 text-warning '
                          : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {allergy.severity.replace('_', ' ')}
                  </span>
                )}
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEditAllergy(allergy)}
                    aria-label={`Edit ${allergy.allergen}`}
                  >
                    <Pencil className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDeleteItem('allergy', allergy.id, allergy.allergen)}
                  aria-label={`Delete ${allergy.allergen}`}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </PrimaryTabsContent>

      <PrimaryTabsContent value="ofaScreenings" className="space-y-4">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <h3 className="text-lg font-semibold">OFA / Health Screenings</h3>
          {!readOnly && (
            <Button size="sm" onClick={() => onAddItem('ofa_screening')}>
              <Plus className="h-4 w-4 mr-1" />
              Add OFA Screening
            </Button>
          )}
        </div>
        <div className="grid gap-4">
          {ofaScreeningsData.length === 0 && (
            <p className="text-muted-foreground text-sm py-4 text-center">
              No OFA screenings recorded yet.
            </p>
          )}
          {ofaScreeningsData.map(ofa => (
            <div key={ofa.id} className="p-4 border rounded-lg">
              <div className="flex flex-wrap justify-between items-start gap-2">
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
                    {formatHealthDate(ofa.test_date)}
                    {ofa.veterinarian ? ` \u2022 ${ofa.veterinarian}` : ''}
                  </p>
                  {ofa.result && <p className="text-sm mt-1">Result: {ofa.result}</p>}
                  {ofa.notes && <p className="text-sm text-muted-foreground mt-1">{ofa.notes}</p>}
                </div>
                {ofa.certification_number && (
                  <span className="text-xs font-mono text-muted-foreground">
                    {ofa.certification_number}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    onDeleteItem('ofa_screening', ofa.id, `${ofa.test_type} screening`)
                  }
                  aria-label={`Delete ${ofa.test_type} screening`}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </PrimaryTabsContent>

      <PrimaryTabsContent value="geneticScreenings" className="space-y-4">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <h3 className="text-lg font-semibold">Genetic Tests</h3>
          {!readOnly && (
            <Button size="sm" onClick={() => onAddItem('genetic_screening')}>
              <Plus className="h-4 w-4 mr-1" />
              Add Genetic Test
            </Button>
          )}
        </div>
        <div className="grid gap-4">
          {geneticScreeningsData.length === 0 && (
            <p className="text-muted-foreground text-sm py-4 text-center">
              No genetic screenings recorded yet.
            </p>
          )}
          {geneticScreeningsData.map(gen => (
            <div key={gen.id} className="p-4 border rounded-lg">
              <div className="flex flex-wrap justify-between items-start gap-2 mb-2">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium">{gen.provider}</h4>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {gen.results.length} marker{gen.results.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{formatHealthDate(gen.test_date)}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  onDeleteItem('genetic_screening', gen.id, `${gen.provider} genetic test`)
                }
                aria-label={`Delete ${gen.provider} genetic test`}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
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
              {gen.notes && <p className="text-sm text-muted-foreground mt-2">{gen.notes}</p>}
            </div>
          ))}
        </div>
      </PrimaryTabsContent>
    </PrimaryTabs>
  );
};
