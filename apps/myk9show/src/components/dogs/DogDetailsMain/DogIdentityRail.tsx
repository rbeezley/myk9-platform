/**
 * DogIdentityRail — the dog's "passport": photo, names, badges, key facts,
 * registry table, owner and actions, in one column beside the page content.
 *
 * Replaces the hero card plus the About / Owner contact / Registrations
 * sidebar cards (docs/plan-dog-detail-passport-rail.md). The registry table
 * is the same component the /dogs card and the My Shows dog strip render, so
 * one dog reads the same way on every surface.
 */

import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, CheckCheck, Mail, Pencil, Phone, Plus } from 'lucide-react';
import ThreeDotMenu from '@/components/common/ThreeDotMenu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn, getInitials } from '@/lib/utils';
import { formatDogAge, getDogRegisteredName } from '@/types/dog-types';
import { DogRegistryTable } from '@/components/dogs/common/DogRegistryTable';
import { buildDogCardRegistryModel } from '@/components/dogs/common/dogRegistryModel';
import { DOG_STATUS_BADGES, getDogSexBadge } from '@/components/dogs/common/dogStatusBadges';
import { formatDisplayDate } from './utils';
import type { DogIdentityRailProps } from './types';

function Row({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="text-muted-foreground flex-shrink-0">{label}</span>
      <span className={mono ? 'font-mono text-xs text-right' : 'font-medium text-right truncate'}>
        {value}
      </span>
    </div>
  );
}

function formatMeasurement(value: string | undefined, suffix: string): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return `${parsed}${suffix}`;
}

const DogIdentityRail: React.FC<DogIdentityRailProps> = ({
  dog,
  owner,
  registrations,
  role = 'exhibitor',
  onEditPanelOpen,
  onPhotoDialogOpen,
  onDeleteDialogOpen,
  onStatusDialogOpen,
  canDelete = true,
  headingRef,
}) => {
  const isSecretary = role === 'secretary';
  const [now] = useState(() => Date.now());
  const registeredName = getDogRegisteredName(dog);
  const sexBadge = getDogSexBadge(dog.sex);
  const statusBadge = DOG_STATUS_BADGES[dog.status || 'active'];
  const deceasedSuffix =
    dog.status === 'deceased' && dog.deceasedDate ? ` — ${formatDisplayDate(dog.deceasedDate)}` : '';

  const registry = useMemo(
    () => buildDogCardRegistryModel(registrations ?? dog.registrations),
    [registrations, dog.registrations]
  );
  // Shared with the /dogs card so one date of birth cannot read two ways.
  const age = useMemo(() => formatDogAge(dog, new Date(now)), [dog, now]);
  const born = dog.dateOfBirth
    ? `${formatDisplayDate(dog.dateOfBirth)}${age ? ` · ${age}` : ''}`
    : null;
  const height = formatMeasurement(dog.height, '"');
  const weight = formatMeasurement(dog.weight, ' lbs');
  const size = [height, weight].filter(Boolean).join(' · ') || null;

  const ownerBody = (
    <>
      {owner.id === 'loading' ? (
        <span className="text-sm font-semibold text-muted-foreground">{owner.name}</span>
      ) : owner.id !== 'unknown' ? (
        <Link
          to={`/people/${owner.id}`}
          className="text-sm font-semibold hover:text-primary transition-colors"
        >
          {owner.name}
        </Link>
      ) : (
        <span className="text-sm font-semibold">{owner.name}</span>
      )}
      {owner.email && owner.email !== 'N/A' && (
        <a
          href={`mailto:${owner.email}`}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1.5"
        >
          <Mail className="h-3.5 w-3.5 flex-shrink-0" />
          {owner.email}
        </a>
      )}
      {owner.phone && owner.phone !== 'N/A' && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
          <Phone className="h-3.5 w-3.5 flex-shrink-0" />
          {owner.phone}
        </div>
      )}
    </>
  );

  return (
    <aside
      data-dog-identity
      className="rounded-xl bg-card border border-border overflow-hidden lg:w-[320px] lg:flex-shrink-0"
    >
      <div className="relative h-56 lg:h-80 bg-card-secondary flex items-center justify-center">
        <Avatar className="h-28 w-28 lg:h-36 lg:w-36">
          {dog.imageUrl ? (
            <AvatarImage src={dog.imageUrl} alt={`${dog.callName}'s photo`} className="object-cover" />
          ) : (
            <AvatarFallback className="bg-primary/10 text-4xl font-semibold text-primary">
              {getInitials(dog.callName)}
            </AvatarFallback>
          )}
        </Avatar>
        <button
          type="button"
          onClick={onPhotoDialogOpen}
          aria-label="Edit dog photo"
          className="absolute right-3 bottom-3 flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background shadow-sm hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Camera className="h-5 w-5" />
        </button>
      </div>

      <div className="p-4 lg:p-5">
        {/* tabIndex=-1: not in tab order, only a route-entry focus target. */}
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-semibold tracking-tight text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
        >
          {dog.callName}
        </h1>
        {registeredName && (
          <p className="text-sm italic text-muted-foreground mt-0.5">{registeredName}</p>
        )}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {sexBadge && (
            <Badge variant="secondary" className={sexBadge.className}>
              {sexBadge.label}
            </Badge>
          )}
          {statusBadge && (
            <Badge variant="secondary" className={statusBadge.className}>
              {statusBadge.label}
              {deceasedSuffix}
            </Badge>
          )}
        </div>

        <div className="mt-5 space-y-2">
          <Row label="Breed" value={registry.breed} />
          {registry.breedVaries && <Row label="Breed" value="Varies by registry" />}
          <Row label="Born" value={born} />
          <Row label="Color" value={dog.color ?? null} />
          <Row label="Height / Weight" value={size} />
          <Row label="Microchip" value={dog.microchipNumber ?? null} mono />
        </div>

        {registry.rows.length > 0 && (
          <>
            <div className="mt-5 mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Registrations
            </div>
            <DogRegistryTable registry={registry} />
          </>
        )}

        <div
          className={cn(
            'mt-5',
            isSecretary && 'rounded-lg border border-teal-400 dark:border-teal-600 p-3'
          )}
        >
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {isSecretary ? 'Primary contact' : 'Owner'}
          </div>
          {ownerBody}
        </div>

        <div className="mt-6 flex flex-col gap-2">
          {isSecretary ? (
            <Button variant="default" className="w-full gap-1.5">
              <CheckCheck className="h-4 w-4" />
              Verify for entry
            </Button>
          ) : (
            <Button variant="default" className="w-full gap-1.5" asChild>
              <a href="/shows">
                <Plus className="h-4 w-4" />
                Enter a show
              </a>
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onEditPanelOpen} className="flex-1 gap-1.5">
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
            <ThreeDotMenu
              onEdit={onEditPanelOpen}
              onEditPhoto={onPhotoDialogOpen}
              onChangeStatus={onStatusDialogOpen}
              onDelete={canDelete ? onDeleteDialogOpen : undefined}
              editLabel="Edit Dog"
              hideEdit
            />
          </div>
        </div>
      </div>
    </aside>
  );
};

export default DogIdentityRail;
