import React, { Suspense, useCallback, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { ShowDraft } from '@/store/wizardStore';
import { ORGANIZATIONS } from '../ShowDetailsStep.types';
import { SectionHeading } from './SectionHeading';
import { VenuePinMap } from '@/components/common/LazyComponents';
import { invalidateVenuePinIfLocationChanged } from '@/features/maps/invalidateVenuePin';
import { VenueAddressAutocomplete } from '@/features/maps/VenueAddressAutocomplete';
import { useVenueAutoLocate, useVenuePinLocator } from '@/features/maps/useVenuePinLocator';
import type { VenuePinValue } from '@/features/maps/normalizePinValue';

interface BasicsSectionProps {
  show: ShowDraft;
  onUpdate: (patch: Partial<ShowDraft>) => void;
  /** Host-club picker, supplied by the step (which owns club state). */
  clubField: React.ReactNode;
  organizationDisabled?: boolean | undefined;
  organizationValue?: string | undefined;
  organizationHint?: string | undefined;
}

/* ------------------------------------------------------------------ */
/*  Basics — the "what is this show" group: name, organization,        */
/*  host club, location. The three fields a secretary always fills.    */
/* ------------------------------------------------------------------ */

export const BasicsSection: React.FC<BasicsSectionProps> = ({
  show,
  onUpdate,
  clubField,
  organizationDisabled = false,
  organizationValue,
  organizationHint,
}) => {
  const address = show.location || '';
  // Memoized on the coordinates: the locate's stale-result guard compares the
  // pin by identity, so a fresh object per render would drop every result.
  const pin = useMemo<VenuePinValue | null>(
    () =>
      show.latitude != null && show.longitude != null
        ? { lat: show.latitude, lng: show.longitude }
        : null,
    [show.latitude, show.longitude]
  );
  const setPin = useCallback(
    ({ lat, lng }: VenuePinValue) => onUpdate({ latitude: lat, longitude: lng }),
    [onUpdate]
  );
  const locator = useVenuePinLocator({ address, value: pin, onChange: setPin });
  const autoLocate = useVenueAutoLocate({ address, hasPin: pin !== null, locator });

  return (
    <div>
      <SectionHeading>Basics</SectionHeading>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="show-name">
            Show Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="show-name"
            value={show.name || ''}
            onChange={e => onUpdate({ name: e.target.value })}
            placeholder="Enter show name"
            className="border border-border bg-input rounded-md"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="show-organization">
            Organization <span className="text-destructive">*</span>
          </Label>
          <Select
            value={organizationValue ?? show.organization ?? ''}
            disabled={organizationDisabled}
            onValueChange={value => onUpdate({ organization: value })}
          >
            <SelectTrigger id="show-organization" className="bg-input h-10">
              <SelectValue placeholder="Select organization">
                {show.organization
                  ? ORGANIZATIONS.find(t => t.value === show.organization)?.label
                  : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ORGANIZATIONS.map(org => (
                <SelectItem key={org.value} value={org.value}>
                  {org.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {organizationHint && (
            <p className="text-xs text-muted-foreground" data-testid="organization-guidance">
              {organizationHint}
            </p>
          )}
        </div>

        {clubField}

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="show-location">
            Location <span className="text-destructive">*</span>
          </Label>
          <VenueAddressAutocomplete
            id="show-location"
            value={address}
            onChange={location =>
              onUpdate(invalidateVenuePinIfLocationChanged(show.location, { location }))
            }
            onPlaceSelected={({ location, lat, lng }) =>
              onUpdate(
                invalidateVenuePinIfLocationChanged(show.location, {
                  location,
                  latitude: lat,
                  longitude: lng,
                })
              )
            }
            onSettledBlur={autoLocate}
            placeholder="Enter venue name and address"
            rows={3}
          />
        </div>

        <div className="md:col-span-2">
          <Suspense fallback={<Skeleton className="h-[280px] w-full rounded-lg" />}>
            <VenuePinMap address={address} value={pin} onChange={setPin} locator={locator} />
          </Suspense>
        </div>
      </div>
    </div>
  );
};
