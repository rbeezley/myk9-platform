/**
 * Registration Number Needed Tab (MYK9-1162)
 *
 * Lists the entries a trial manager keyed in for a dog with no registration
 * number for the trial's registry. Each holds its capacity place and stays off
 * the catalog, run sheet, scoresheets and packet until a number exists. The
 * list is derived, so adding the number removes the row with no further step.
 *
 * Resolving a row is a secretary act and always an existing control: the dog's
 * own Add registration panel, or the entry form's Pull / Withdraw. Nothing here
 * withdraws or pulls an entry on its own.
 */
import React, { useState } from 'react';
import { AlertCircle, FileWarning } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { TableSkeleton } from '@/components/common/SkeletonLoaders';
import DogRegistrationDialogs from '@/components/dogs/DogDetails/Registrations/DogRegistrationDialogs';
import type { Dog } from '@/types/dog-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import type { RegistrationNeededRow } from './management/registrationNeeded';

interface RegistrationNeededTabProps {
  rows: readonly RegistrationNeededRow[];
  /** The entries, trials or dog roster this list derives from are still loading. */
  loading: boolean;
  /** The entries read failed, so an empty list says nothing about the show. */
  unknown: boolean;
  /** Opens the entry's form in the Registrations view, where Pull and Withdraw live. */
  onOpenEntry: (entry: EntryManagementEntry) => void;
}

function classLine(entry: EntryManagementEntry): string {
  const entryClass = entry.classes[0];
  if (!entryClass) return '';
  const trial = [
    entryClass.trialDate,
    entryClass.trialNumber ? `Trial ${entryClass.trialNumber}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return [trial, entryClass.name].filter(Boolean).join(' · ');
}

export const RegistrationNeededTab: React.FC<RegistrationNeededTabProps> = ({
  rows,
  loading,
  unknown,
  onOpenEntry,
}) => {
  const [addFor, setAddFor] = useState<Dog | null>(null);
  const [openRequested, setOpenRequested] = useState(false);

  const requestAdd = (dog: Dog) => {
    setAddFor(dog);
    setOpenRequested(true);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <FileWarning className="h-5 w-5" aria-hidden />
          Registration number needed
        </h2>
        <p className="text-sm text-muted-foreground">
          These entries hold their place in the class but stay off the catalog, run sheet,
          scoresheets and packet until the dog has a registration number for the trial&apos;s
          registry.
        </p>
      </div>

      {loading ? (
        <div
          role="status"
          aria-label="Loading entries awaiting a registration number"
          className="py-4"
        >
          <TableSkeleton rows={4} columns={4} />
        </div>
      ) : unknown ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="mx-auto mb-4 h-12 w-12 text-destructive" aria-hidden />
            <p className="text-lg font-medium">Couldn&apos;t load this show&apos;s entries</p>
            <p className="mt-1 text-sm text-muted-foreground">
              We don&apos;t know which entries need a registration number. Retry from the All view.
            </p>
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-lg font-medium">No entries need a registration number</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Every entry in this show has a number for its trial&apos;s registry.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ entry, registryId, dog }) => (
            <li key={entry.id}>
              <Card>
                <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{entry.dogName}</span>
                      <Badge variant="outline">{registryId} number missing</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{entry.ownerName}</p>
                    <p className="text-sm text-muted-foreground">{classLine(entry)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="min-h-11"
                      onClick={() => requestAdd(dog)}
                      aria-label={`Add registration for ${entry.dogName}`}
                    >
                      Add registration
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-11"
                      onClick={() => onOpenEntry(entry)}
                      aria-label={`Pull or withdraw ${entry.dogName}`}
                    >
                      Pull / Withdraw
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {/* The dog's own Add registration panel, hosted once. Opening is driven by
          `autoOpenAddDialog`, which fires after the host's per-dog reset effect. */}
      <DogRegistrationDialogs
        dog={addFor ?? undefined}
        autoOpenAddDialog={openRequested}
        onAddRequestConsumed={() => setOpenRequested(false)}
      />
    </div>
  );
};

export default RegistrationNeededTab;
