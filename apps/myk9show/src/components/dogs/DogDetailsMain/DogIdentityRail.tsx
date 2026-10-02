/**
 * DogIdentityRail — the dog's "passport": key facts, registry table, owner and
 * the entry action, in one column beside the page content. The photo, names,
 * badges and menu moved into the page's DetailHero (DogHero, MYK9-930).
 *
 * Replaces the hero card plus the About / Owner contact / Registrations
 * sidebar cards (docs/plan-dog-detail-passport-rail.md). The registry table
 * is the same component the /dogs card and the My Shows dog strip render, so
 * one dog reads the same way on every surface.
 */

import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDogAge, getDogDisplayName } from '@/types/dog-types';
import { DogRegistryTable } from '@/components/dogs/common/DogRegistryTable';
import { buildDogCardRegistryModel } from '@/components/dogs/common/dogRegistryModel';
import { withEntryDogContext } from '@/features/registration/entryDogContext';
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
  onAddRegistration,
  onManageRegistrations,
  registrationsFailed = false,
  registrationsLoading = false,
  onRetryRegistrations,
  role = 'exhibitor',
  canOpenOwnerRecord = false,
}) => {
  const isSecretary = role === 'secretary';
  const [now] = useState(() => Date.now());
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
      ) : owner.id !== 'unknown' && canOpenOwnerRecord ? (
        <Link
          to={`/people/${owner.id}`}
          // The person's breadcrumb returns to this dog, not to the People list.
          state={{
            backTo: {
              href: `/dogs/${dog.id}`,
              label: getDogDisplayName(dog),
              parent: { label: 'Dogs', href: '/dogs' },
            },
          }}
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
      <div className="p-4 lg:p-5">
        {!isSecretary && (
          <div className="mt-4">
            <Button variant="default" className="min-h-11 w-full gap-1.5" asChild>
              {/* Carries this dog through browse -> show detail -> the entry
                  wizard, which preselects it if it is still enterable
                  (MYK9-519). Still the ordinary browse page, not a second
                  entry flow. */}
              <Link to={withEntryDogContext('/shows', dog.id)}>
                <Plus className="h-4 w-4" />
                Enter a show
              </Link>
            </Button>
          </div>
        )}

        <div className="mt-4 space-y-2">
          <Row label="Breed" value={registry.breed} />
          {registry.breedVaries && <Row label="Breed" value="Varies by registry" />}
          <Row label="Born" value={born} />
          <Row label="Color" value={dog.color ?? null} />
          <Row label="Height / Weight" value={size} />
          <Row label="Microchip" value={dog.microchipNumber ?? null} mono />
        </div>

        <div className="mt-4 mb-1 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Registrations
          </span>
          <button
            type="button"
            onClick={onAddRegistration}
            className="inline-flex min-h-[44px] items-center gap-1 text-xs font-medium text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            Add registration
          </button>
        </div>
        {/* Rows first: React Query keeps `data` across a failed refetch and the
            `dog.registrations` fallback is often already populated by the dogs
            list read, so neither a pending nor a failed query should blank a
            registry we can actually render. Only when there is nothing to show
            do loading and failure need to be told apart from "has none" — this
            rail is the page's only registration summary, so printing the empty
            copy for either would read a registered dog as unregistered. */}
        {registry.rows.length > 0 ? (
          <DogRegistryTable registry={registry} />
        ) : registrationsLoading ? (
          <p className="text-xs text-muted-foreground" role="status">
            Loading registrations…
          </p>
        ) : registrationsFailed ? (
          <div className="flex items-center gap-2">
            <p className="text-xs text-destructive">Couldn’t load registrations.</p>
            {onRetryRegistrations && (
              <button
                type="button"
                onClick={onRetryRegistrations}
                className="inline-flex min-h-11 items-center text-xs font-medium text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
              >
                Try again
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No registrations yet.</p>
        )}
        {/* Always mounted for an exhibitor — not gated on the row count, and not
            on the read succeeding. Unmounting it while the panel is open (last
            registration deleted, or a refetch failing) takes away the element
            SlideOverPanel returns focus to, dropping focus on <body>. */}
        {!isSecretary && onManageRegistrations && (
          <button
            type="button"
            onClick={onManageRegistrations}
            aria-haspopup="dialog"
            className="mt-2 inline-flex min-h-11 items-center text-xs font-medium text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            Manage registrations
          </button>
        )}

        <div
          className={cn(
            'mt-4',
            isSecretary && 'rounded-lg border border-teal-400 dark:border-teal-600 p-3'
          )}
        >
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {isSecretary ? 'Primary contact' : 'Owner'}
          </div>
          {ownerBody}
        </div>
      </div>
    </aside>
  );
};

export default DogIdentityRail;
