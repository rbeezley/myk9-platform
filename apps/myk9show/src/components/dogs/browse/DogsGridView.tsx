import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Cake, PawPrint, User } from 'lucide-react';
import { getDogDisplayName, type Dog } from '@/types/dog-types';
import { BrowseCard, BrowseCardAvatar, BrowseCardDetail } from '@/components/common/BrowseCard';
import { getDogCardFacts, type DogCardFactKind } from './dogCardFacts';
import { DOG_STATUS_BADGES, getDogSexBadge } from '@/components/dogs/common/dogStatusBadges';
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

const FACT_ICONS: Record<DogCardFactKind, React.ComponentType<{ className?: string }>> = {
  breed: PawPrint,
  age: Cake,
  owner: User,
};

export const DogsGridView: React.FC<DogsGridViewProps> = ({ dogs, showOwner = true }) => {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
      {dogs.map(dog => {
        const sexBadge = getDogSexBadge(dog.sex);
        const displayName = dog.callName || dog.name;
        const statusKey = dog.status || 'active';
        const statusBadge = DOG_STATUS_BADGES[statusKey];
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
                {sexBadge && (
                  <Badge variant="secondary" className={sexBadge.className}>
                    {sexBadge.label}
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
