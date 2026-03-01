import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PawPrint, User, Eye } from 'lucide-react';
import { getDogDisplayName, type Dog } from '@/types/dog-types';

interface DogsGridViewProps {
  dogs: Dog[];
}

function getDogInitial(dog: Dog): string {
  return (getDogDisplayName(dog) || '?').charAt(0).toUpperCase();
}

function formatSex(sex: string | undefined): string | null {
  if (!sex) return null;
  return sex.charAt(0).toUpperCase() + sex.slice(1);
}

export const DogsGridView: React.FC<DogsGridViewProps> = ({ dogs }) => {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
      {dogs.map(dog => {
        const sexLabel = formatSex(dog.sex);

        return (
          <div
            key={dog.id}
            className="apple-browse-card cursor-pointer"
            onClick={() => navigate(`/dogs/${dog.id}`)}
            role="link"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && navigate(`/dogs/${dog.id}`)}
          >
            <div className="apple-browse-card-header">
              <div className="apple-browse-card-badges">
                {sexLabel && (
                  <Badge
                    variant="secondary"
                    className={`text-xs ${dog.sex === 'male' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300'}`}
                  >
                    {sexLabel}
                  </Badge>
                )}
                {(!dog.status || dog.status === 'active') && (
                  <Badge
                    variant="secondary"
                    className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                  >
                    Active
                  </Badge>
                )}
                {dog.status === 'retired' && (
                  <Badge
                    variant="secondary"
                    className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                  >
                    Retired
                  </Badge>
                )}
                {dog.status === 'deceased' && (
                  <Badge
                    variant="secondary"
                    className="text-xs bg-gray-100 text-gray-500 dark:bg-gray-800/30 dark:text-gray-400"
                  >
                    Deceased
                  </Badge>
                )}
              </div>
            </div>

            <div className="apple-browse-card-content">
              {/* Dog identity: photo/initial + call name */}
              <div className="flex items-center gap-3 mb-2">
                {dog.imageUrl ? (
                  <img
                    src={dog.imageUrl}
                    alt={dog.callName || dog.name}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
                    {getDogInitial(dog)}
                  </div>
                )}
                <h3 className="apple-browse-card-title">{dog.callName || dog.name}</h3>
              </div>

              <div className="apple-browse-card-details">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {dog.breed && (
                    <div className="apple-browse-card-detail-item">
                      <PawPrint className="h-4 w-4" />
                      <span>{dog.breed}</span>
                    </div>
                  )}

                  {dog.ownerName && (
                    <div className="apple-browse-card-detail-item">
                      <User className="h-4 w-4" />
                      <span>{dog.ownerName}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="apple-browse-card-footer">
                <div />
                <Button
                  variant="outline"
                  size="sm"
                  className="apple-browse-view-details-btn"
                  onClick={e => {
                    e.stopPropagation();
                    navigate(`/dogs/${dog.id}`);
                  }}
                >
                  <Eye className="h-4 w-4 mr-1" />
                  View Dog
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default DogsGridView;
