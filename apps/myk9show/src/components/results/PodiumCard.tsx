import { Card } from '@/components/ui/card';
import { PodiumPosition } from './PodiumPosition';
import type { Placement } from '@/hooks/queries/useShowResults';

interface PodiumCardProps {
  className: string;
  placements: Placement[];
}

export function PodiumCard({ className, placements }: PodiumCardProps) {
  const sorted = [...placements].sort((a, b) => a.placement - b.placement);

  return (
    <Card className="overflow-hidden">
      <div className="border-b bg-muted/40 px-4 py-2.5">
        <h3 className="text-sm font-semibold tracking-tight">{className}</h3>
      </div>
      <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4 sm:items-end">
        {sorted.map(p => (
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
