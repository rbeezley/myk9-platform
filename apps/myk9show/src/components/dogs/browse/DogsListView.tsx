import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PawPrint, User, Eye } from 'lucide-react';
import type { Dog } from '@/types/dog-types';

interface DogsListViewProps {
  dogs: Dog[];
}

function getDogInitial(dog: Dog): string {
  return (dog.callName || dog.name || '?').charAt(0).toUpperCase();
}

function formatSex(sex: string | undefined): string | null {
  if (!sex) return null;
  return sex.charAt(0).toUpperCase() + sex.slice(1);
}

export const DogsListView: React.FC<DogsListViewProps> = ({ dogs }) => {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      {dogs.map(dog => {
        const sexLabel = formatSex(dog.sex);

        return (
          <Card
            key={dog.id}
            className="bg-card/95 backdrop-blur-sm border-border/50 hover:shadow-md transition-all duration-200 cursor-pointer"
            onClick={() => navigate(`/dogs/${dog.id}`)}
          >
            <CardContent className="p-6">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
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
                      <div>
                        <h3 className="text-lg font-semibold">{dog.callName || dog.name}</h3>
                        {dog.breed && <p className="text-sm text-muted-foreground">{dog.breed}</p>}
                      </div>
                    </div>
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

                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                    {dog.breed && (
                      <div className="flex items-center gap-2">
                        <PawPrint className="h-4 w-4 text-muted-foreground" />
                        <span>{dog.breed}</span>
                      </div>
                    )}

                    {dog.ownerName && (
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span>{dog.ownerName}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={e => {
                      e.stopPropagation();
                      navigate(`/dogs/${dog.id}`);
                    }}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View Dog
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default DogsListView;
