/**
 * Profile Display Component
 *
 * Read-only display of personal information
 */

import { Label } from '@/components/ui/label';
import { Mail, Phone, MapPin } from 'lucide-react';
import { formatPhoneNumber } from './utils';
import type { PersonData } from './types';

interface ProfileDisplayProps {
  person: PersonData | undefined;
}

export function ProfileDisplay({ person }: ProfileDisplayProps) {
  if (!person) return null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-1">
        <Label className="text-muted-foreground text-sm">Name</Label>
        <p className="font-medium">
          {person.first_name} {person.last_name}
        </p>
      </div>
      <div className="space-y-1">
        <Label className="text-muted-foreground text-sm flex items-center gap-1">
          <Mail className="h-3 w-3" /> Email
        </Label>
        <p>{person.email}</p>
      </div>
      <div className="space-y-1">
        <Label className="text-muted-foreground text-sm flex items-center gap-1">
          <Phone className="h-3 w-3" /> Phone
        </Label>
        <p>
          {person.phone ? (
            formatPhoneNumber(person.phone)
          ) : (
            <span className="text-muted-foreground italic">Not provided</span>
          )}
        </p>
      </div>
      <div className="space-y-1">
        <Label className="text-muted-foreground text-sm flex items-center gap-1">
          <MapPin className="h-3 w-3" /> Address
        </Label>
        <p>
          {person.street_address ? (
            <>
              {person.street_address}
              {person.city && `, ${person.city}`}
              {person.state && `, ${person.state}`}
              {person.zip_code && ` ${person.zip_code}`}
            </>
          ) : (
            <span className="text-muted-foreground italic">Not provided</span>
          )}
        </p>
      </div>
    </div>
  );
}
