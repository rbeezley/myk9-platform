import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Cake, PawPrint, User } from 'lucide-react';
import { getDogDisplayName, type Dog } from '@/types/dog-types';
import { BrowseCard, BrowseCardAvatar, BrowseCardDetail } from '@/components/common/BrowseCard';
import { getDogCardFacts, type DogCardFactKind } from './dogCardFacts';
import { DogRegistryTable } from '@/components/dogs/common/DogRegistryTable';
import { buildDogCardRegistryModel } from '@/components/dogs/common/dogRegistryModel';

interface DogsGridViewProps {
  dogs: Dog[];
  /**
   * Whether the owner line earns its space on this surface. False on the
   * exhibitor-only roster, where every dog belongs to the viewer and the line
   * can only ever repeat their own name back at them (MYK9-219).
   */
  showOwner?: boolean;
}

function formatSex(sex: string | undefined): string | null {
  if (!sex) return null;
  return sex.charAt(0).toUpperCase() + sex.slice(1);
}

const FACT_ICONS: Record<DogCardFactKind, React.ComponentType<{ className?: string }>> = {
  breed: PawPrint,
  age: Cake,
  owner: User,
};

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  active: {
    label: 'Active',
    className: 'text-xs bg-success/10 text-success ',
  },
  retired: {
    label: 'Retired',
    className: 'text-xs bg-warning/10 text-warning ',
  },
  deceased: {
    // Tokens, not raw gray: gray-500 on gray-100 measured 4.39:1 in light mode,
    // under the 4.5:1 floor. bg-muted/text-muted-foreground is 5.09:1 light and
    // 4.55:1 dark, and tracks the theme like the sibling badges above.
    label: 'Deceased',
    className: 'text-xs bg-muted text-muted-foreground',
  },
};

export const DogsGridView: React.FC<DogsGridViewProps> = ({ dogs, showOwner = true }) => {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
      {dogs.map(dog => {
        const sexLabel = formatSex(dog.sex);
        const displayName = dog.callName || dog.name;
        const statusKey = dog.status || 'active';
        const statusBadge = STATUS_BADGES[statusKey];
        const registry = buildDogCardRegistryModel(dog.registrations);
        // One breed line when every registry agrees; when they differ the
        // table below carries each registry's own breed (see dogRegistryModel).
        const facts = getDogCardFacts(dog, { showOwner }).map(fact =>
          fact.kind === 'breed' && registry.breedVaries
            ? { ...fact, text: 'Breed varies by registry' }
            : fact
        );

        return (
          <BrowseCard
            key={dog.id}
            href={`/dogs/${dog.id}`}
            name={displayName}
            avatar={
              <BrowseCardAvatar
                src={dog.imageUrl}
                fallback={(getDogDisplayName(dog) || '?').charAt(0).toUpperCase()}
                alt={displayName}
              />
            }
            badges={
              <>
                {sexLabel && (
                  <Badge
                    variant="secondary"
                    className={`text-xs ${dog.sex === 'male' ? 'bg-info/10 text-info ' : 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300'}`}
                  >
                    {sexLabel}
                  </Badge>
                )}
                {statusBadge && (
                  <Badge variant="secondary" className={statusBadge.className}>
                    {statusBadge.label}
                  </Badge>
                )}
              </>
            }
          >
            {facts.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {facts.map(fact => {
                  const Icon = FACT_ICONS[fact.kind];
                  return (
                    <BrowseCardDetail
                      key={fact.kind}
                      icon={<Icon className="h-3.5 w-3.5 shrink-0" />}
                    >
                      {fact.text}
                    </BrowseCardDetail>
                  );
                })}
              </div>
            )}
            <div className="mt-2">
              <DogRegistryTable registry={registry} />
            </div>
          </BrowseCard>
        );
      })}
    </div>
  );
};

export default DogsGridView;
