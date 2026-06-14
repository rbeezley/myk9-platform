import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import DogActionsMenu from './DogActionsMenu';
import type { Dog, Owner } from '@/types/dog-types';
import { User, Ruler, Weight, Cake, PawPrint } from 'lucide-react';

interface DogDetailsCardProps {
  dog: Dog;
  owner: Owner | null;
  calculateAge: (dob: string) => string;
  getOrganizationBadgeColor: (org: string) => string;
  onEdit: (dog: Dog) => void;
  onDelete: (id: string) => void;
  onEditPhoto: (dog: Dog) => void;
}

const DogDetailsCard: React.FC<DogDetailsCardProps> = ({
  dog,
  owner,
  calculateAge,
  getOrganizationBadgeColor,
  onEdit,
  onDelete,
  onEditPhoto,
}) => {
  return (
    <Card className="overflow-hidden relative max-w-lg w-full mx-auto cursor-pointer group">
      <div className="absolute top-3 right-3 z-10">
        <DogActionsMenu dog={dog} onEdit={onEdit} onDelete={onDelete} onEditPhoto={onEditPhoto} />
      </div>
      <div className="h-48 overflow-hidden flex items-center justify-center p-4 bg-card">
        <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-white dark:border-gray-700 shadow-lg bg-gray-100 flex items-center justify-center">
          {dog.imageUrl ? (
            <img
              src={dog.imageUrl}
              alt={dog.callName}
              className="w-full h-full object-cover object-top"
            />
          ) : (
            <PawPrint className="w-16 h-16 text-gray-400" />
          )}
        </div>
      </div>
      <CardHeader className="py-0 flex flex-col items-center">
        <CardTitle className="text-2xl text-center mt-[-0.75rem] mb-5">{dog.callName}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-base">
          <div className="flex items-center gap-2">
            {owner && owner.profileImage ? (
              <img
                src={owner.profileImage}
                alt={owner.name}
                className="w-8 h-8 rounded-full object-cover border border-gray-300 dark:border-gray-600"
              />
            ) : (
              <User className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            )}
            <span>
              Owner:{' '}
              {owner ? (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    window.location.href = `/people/${owner.id}`;
                  }}
                  className="text-info hover:underline focus:outline-none"
                >
                  {owner.name}
                </button>
              ) : (
                'Unknown'
              )}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Ruler className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            <span>Height: {dog.height} inches</span>
          </div>
          <div className="flex items-center gap-2">
            <Weight className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            <span>Weight: {dog.weight} lbs</span>
          </div>
          <div className="flex items-center gap-2">
            <User
              className={`w-5 h-5 ${dog.gender === 'Male' ? 'text-blue-500' : 'text-pink-500'}`}
            />
            <span>{dog.gender}</span>
          </div>
          <div className="flex items-center gap-2">
            <Cake className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            <span>Age: {calculateAge(dog?.dateOfBirth || '')}</span>
          </div>
        </div>
        <div className="mt-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Registrations:</p>
          <div className="flex flex-wrap gap-2">
            {dog.registrations && dog.registrations.length > 0 ? (
              dog.registrations.map((reg: { id: string; organization: string }) => (
                <Badge
                  key={reg.id}
                  variant="outline"
                  className={getOrganizationBadgeColor(reg.organization)}
                >
                  {reg.organization}
                </Badge>
              ))
            ) : (
              <span className="text-gray-400">None</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default DogDetailsCard;
