import React, { Suspense } from 'react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
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

interface BasicsSectionProps {
  show: ShowDraft;
  onUpdate: (patch: Partial<ShowDraft>) => void;
  /** Host-club picker, supplied by the step (which owns club state). */
  clubField: React.ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Basics — the "what is this show" group: name, organization,        */
/*  host club, location. The three fields a secretary always fills.    */
/* ------------------------------------------------------------------ */

export const BasicsSection: React.FC<BasicsSectionProps> = ({ show, onUpdate, clubField }) => (
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
          value={show.organization || ''}
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
      </div>

      {clubField}

      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="show-location">
          Location <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="show-location"
          value={show.location || ''}
          onChange={e => {
            const location = e.target.value;
            onUpdate(invalidateVenuePinIfLocationChanged(show.location, { location }));
          }}
          placeholder="Enter venue name and address"
          rows={3}
          className="border border-border bg-input rounded-md"
        />
      </div>

      <div className="md:col-span-2">
        <Suspense fallback={<Skeleton className="h-[280px] w-full rounded-lg" />}>
          <VenuePinMap
            address={show.location || ''}
            value={
              show.latitude != null && show.longitude != null
                ? { lat: show.latitude, lng: show.longitude }
                : null
            }
            onChange={({ lat, lng }) => onUpdate({ latitude: lat, longitude: lng })}
          />
        </Suspense>
      </div>
    </div>
  </div>
);
