import React from 'react';
import { Badge } from '@/components/ui/badge';
import { PawPrint, User } from 'lucide-react';
import { getDogDisplayName, type Dog } from '@/types/dog-types';
import { BrowseCard, BrowseCardAvatar, BrowseCardDetail } from '@/components/common/BrowseCard';

interface DogsGridViewProps {
  dogs: Dog[];
}

function formatSex(sex: string | undefined): string | null {
  if (!sex) return null;
  return sex.charAt(0).toUpperCase() + sex.slice(1);
}

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  active: {
    label: 'Active',
    className:
      'text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  },
  retired: {
    label: 'Retired',
    className: 'text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  },
  deceased: {
    label: 'Deceased',
    className: 'text-xs bg-gray-100 text-gray-500 dark:bg-gray-800/30 dark:text-gray-400',
  },
};

export const DogsGridView: React.FC<DogsGridViewProps> = ({ dogs }) => {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
      {dogs.map(dog => {
        const sexLabel = formatSex(dog.sex);
        const displayName = dog.callName || dog.name;
        const statusKey = dog.status || 'active';
        const statusBadge = STATUS_BADGES[statusKey];

        return (
          <BrowseCard
            key={dog.id}
            href={`/dogs/${dog.id}`}
            actionLabel="View Dog"
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
                    className={`text-xs ${dog.sex === 'male' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300'}`}
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
            {(dog.breed || dog.ownerName) && (
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {dog.breed && (
                  <BrowseCardDetail icon={<PawPrint className="h-3.5 w-3.5 shrink-0" />}>
                    {dog.breed}
                  </BrowseCardDetail>
                )}
                {dog.ownerName && (
                  <BrowseCardDetail icon={<User className="h-3.5 w-3.5 shrink-0" />}>
                    {dog.ownerName}
                  </BrowseCardDetail>
                )}
              </div>
            )}
            {dog.registrations && dog.registrations.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {dog.registrations.map(reg => (
                  <span
                    key={reg.id}
                    className="bg-muted px-2 py-0.5 rounded text-xs text-muted-foreground"
                  >
                    {reg.organization} {reg.registrationNumber}
                  </span>
                ))}
              </div>
            )}
          </BrowseCard>
        );
      })}
    </div>
  );
};

export default DogsGridView;
