import { Trophy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import type { DogStats } from './analytics-utils';
import { formatTime } from './analytics-formatting';

interface DogBreakdownCardsProps {
  dogs: DogStats[];
  onDogClick?: (dogId: string) => void;
}

export function DogBreakdownCards({ dogs, onDogClick }: DogBreakdownCardsProps) {
  if (dogs.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance by Dog</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dogs.map((dog) => (
            <div
              key={dog.dogId}
              className={`relative rounded-lg border border-border/50 bg-card p-4 transition-all${
                onDogClick ? ' cursor-pointer hover:-translate-y-0.5' : ''
              }`}
              onClick={onDogClick ? () => onDogClick(dog.dogId) : undefined}
              role={onDogClick ? 'button' : undefined}
              tabIndex={onDogClick ? 0 : undefined}
              onKeyDown={
                onDogClick
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onDogClick(dog.dogId);
                      }
                    }
                  : undefined
              }
            >
              {dog.isCleanSweep && (
                <div className="absolute right-2 top-2" title="Clean sweep - all qualified!">
                  <Trophy className="h-4 w-4 text-amber-500" />
                </div>
              )}

              <div className="font-semibold">{dog.dogCallName}</div>
              <div className="text-sm text-muted-foreground">
                {dog.entries} {dog.entries === 1 ? 'entry' : 'entries'}
              </div>

              <div className="mt-2">
                <div className="flex items-center justify-between text-xs">
                  <span>Q Rate</span>
                  <span className="font-medium">{dog.qualificationRate}%</span>
                </div>
                <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, dog.qualificationRate))}%` }}
                  />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Best</span>
                  <div className="font-mono">{formatTime(dog.bestTime)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Avg</span>
                  <div className="font-mono">{formatTime(dog.avgTime)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
