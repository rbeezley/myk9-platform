import React from 'react';
import { CheckCircle2, Clock, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { Dog } from '@/types/dog-types';
import type { DbDogRegistration } from '@/types/database-mappings';

interface RegistrationsCardProps {
  dog: Dog;
  registrationsCount: number;
  registrations?: DbDogRegistration[] | undefined;
  onAddRegistration?: () => void;
}

const RegistrationsCard: React.FC<RegistrationsCardProps> = ({
  dog,
  registrationsCount,
  registrations,
  onAddRegistration,
}) => {
  const displayRegistrations = registrations
    ? registrations.map(reg => ({
        id: reg.id,
        organization: reg.organization,
        breed: reg.breed,
        registrationNumber: reg.registration_number,
        registeredName: reg.registered_name,
        status: reg.status,
      }))
    : (dog.registrations ?? []);

  return (
    <Card>
      <CardHeader className="pb-1 pt-4 px-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Registrations · {registrationsCount}
        </span>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {displayRegistrations.map((reg, i) => (
          <div
            key={reg.id ?? i}
            className="flex items-center justify-between gap-2 py-2 border-t border-border first:border-t-0"
          >
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">
                {reg.organization}
                {reg.breed ? (
                  <span className="font-normal text-muted-foreground"> · {reg.breed}</span>
                ) : null}
              </div>
              <div className="font-mono text-xs text-muted-foreground mt-0.5">
                {reg.registrationNumber || reg.registeredName || '—'}
              </div>
            </div>
            {reg.status === 'Pending' ? (
              <Clock className="h-4 w-4 flex-shrink-0 text-amber-500" />
            ) : (
              <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500" />
            )}
          </div>
        ))}
        {displayRegistrations.length === 0 && (
          <p className="text-xs text-muted-foreground py-1">No registrations yet.</p>
        )}
        <Button
          variant="outline"
          size="sm"
          className="w-full mt-3 gap-1.5"
          onClick={onAddRegistration}
        >
          <Plus className="h-3.5 w-3.5" />
          Add registration
        </Button>
      </CardContent>
    </Card>
  );
};

export default RegistrationsCard;
