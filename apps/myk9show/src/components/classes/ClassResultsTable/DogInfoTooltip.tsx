/**
 * DogInfoTooltip - Shows dog registration details on hover
 */

import React from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip/tooltip';
import type { Registration } from '@/types/dog-types';

interface DogInfoTooltipProps {
  dogName: string;
  registrations: Registration[] | undefined;
}

/** Renders a single registration's details */
function RegistrationDetails({ registration }: { registration: Registration }) {
  return (
    <div className="space-y-1">
      <div>
        <strong>Registered Name:</strong> {registration.registeredName}
      </div>
      <div>
        <strong>Registration #:</strong> {registration.registrationNumber}
      </div>
      <div>
        <strong>Breed:</strong> {registration.breed}
      </div>
      {registration.variety && (
        <div>
          <strong>Variety:</strong> {registration.variety}
        </div>
      )}
      <div>
        <strong>Organization:</strong> {registration.organization}
      </div>
    </div>
  );
}

export const DogInfoTooltip: React.FC<DogInfoTooltipProps> = ({
  dogName,
  registrations,
}) => {
  // Scent Work is typically AKC, so prefer AKC registration if available
  const dogRegistration =
    registrations?.find((reg) => reg.organization === 'AKC') ||
    registrations?.[0]; // fallback to first registration

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="font-medium cursor-pointer hover:text-blue-600">
          {dogName}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-sm">
          {dogRegistration ? (
            <RegistrationDetails registration={dogRegistration} />
          ) : (
            <div className="space-y-1">
              <div>
                <strong>Dog Name:</strong> {dogName}
              </div>
              <div className="text-muted-foreground">
                No AKC registration found
              </div>
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
};
