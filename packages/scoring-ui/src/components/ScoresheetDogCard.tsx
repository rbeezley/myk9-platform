/**
 * ScoresheetDogCard — the dog at the top of every scent-work scoresheet
 * (MYK9-1086). One component so the armband, breed and handler read the same
 * on every sport's sheet.
 *
 * The armband badge grows with its digits (4-digit armbands are common at
 * larger trials) instead of squeezing them into a fixed 56px square.
 */

import React from 'react';
import { Card } from '@myk9/ui';

export interface ScoresheetDogCardProps {
  armband: number | string;
  dogName: string;
  breed?: string | undefined;
  handlerName: string;
}

export const ScoresheetDogCard: React.FC<ScoresheetDogCardProps> = ({
  armband,
  dogName,
  breed,
  handlerName,
}) => (
  <Card className="p-4">
    <div className="flex items-center gap-4">
      <div
        className="flex h-16 min-w-[4.5rem] flex-shrink-0 items-center justify-center rounded-xl bg-primary px-3 shadow-md"
        data-testid="scoresheet-armband"
      >
        <span className="text-2xl font-bold tabular-nums text-primary-foreground">{armband}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="truncate text-xl font-semibold leading-tight">{dogName}</div>
        {/* Always reserve the line: the breed can arrive a moment after the
            sheet opens, and the timer controls must not jump while a gloved
            thumb is moving to them. */}
        <div className="min-h-5 truncate text-sm text-muted-foreground">{breed ?? ''}</div>
        <div className="truncate text-sm text-muted-foreground">Handler: {handlerName}</div>
      </div>
    </div>
  </Card>
);
