// src/components/podium/PodiumPosition.tsx
import './podium.css';

export interface PodiumPositionProps {
  placement: 1 | 2 | 3 | 4;
  handlerName: string;
  dogName: string;
  breed: string;
  armband?: number;
  animate?: boolean;
}

const PLACEMENT_LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: '1st',
  2: '2nd',
  3: '3rd',
  4: '4th',
};

const PLACEMENT_CLASSES: Record<1 | 2 | 3 | 4, string> = {
  1: 'podium-position--first',
  2: 'podium-position--second',
  3: 'podium-position--third',
  4: 'podium-position--fourth',
};

export function PodiumPosition({
  placement,
  handlerName,
  dogName,
  breed,
  armband,
  animate = false,
}: PodiumPositionProps) {
  const placementClass = PLACEMENT_CLASSES[placement];
  const placementLabel = PLACEMENT_LABELS[placement];
  const animateClass = animate ? 'podium-position--animate' : '';

  return (
    <div className={`podium-position ${placementClass} ${animateClass}`.trim()}>
      <div className="podium-position__card">
        {/* Medal badge with placement text and CSS shine effect */}
        <div className="podium-position__badge">{placementLabel}</div>
        <div className="podium-position__handler">{handlerName}</div>
        <div className="podium-position__dog">"{dogName}"</div>
        <div className="podium-position__breed">{breed}</div>
        {armband && <div className="podium-position__armband">#{armband}</div>}
      </div>
      {/* Platform - height and color convey rank, no number needed */}
      <div className="podium-position__platform" />
    </div>
  );
}
