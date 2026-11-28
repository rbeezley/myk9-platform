/**
 * Simple DogCard Component for Scoring Pages
 *
 * A minimal dog info display used in scoresheets and confirmations.
 * Displays armband, call name, breed, and handler.
 */

import React from 'react';
import { ArmbandBadge } from '@/components/common/ArmbandBadge';
import { cn } from '@/lib/utils';

export interface DogCardProps {
  armband: number;
  callName: string;
  breed: string;
  handler: string;
  className?: string;
}

export const DogCard: React.FC<DogCardProps> = ({
  armband,
  callName,
  breed,
  handler,
  className,
}) => {
  return (
    <div className={cn('dog-card', className)}>
      <ArmbandBadge armband={armband} srLabel className="dog-card-armband shrink-0" />
      <div className="dog-card-info">
        <div className="dog-card-name">{callName}</div>
        <div className="dog-card-breed">{breed}</div>
        <div className="dog-card-handler">{handler}</div>
      </div>
    </div>
  );
};

export default DogCard;
