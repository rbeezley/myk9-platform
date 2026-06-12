import { Card } from '@/components/ui/card';
import { PodiumPosition } from './PodiumPosition';
import type { Placement } from '@/hooks/queries/useShowResults';

interface PodiumCardProps {
  classTitle: string;
  placements: Placement[];
}

export function PodiumCard({ classTitle, placements }: PodiumCardProps) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b bg-muted/40 px-4 py-2.5">
        <h3 className="celebration-serif text-base">{classTitle}</h3>
      </div>
      <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4 sm:items-end">
        {placements.map(p => (
          <PodiumPosition
            key={p.placement}
            placement={p.placement}
            handlerName={p.handlerName}
            dogName={p.dogName}
            breed={p.breed}
            armband={p.armband}
          />
        ))}
      </div>
    </Card>
  );
}
