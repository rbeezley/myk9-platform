import React from 'react';
import type { TitleProgressResult } from '@/services/titleEngine';
import type { SportTemplateRow } from '@/types/sport-template-types';
import TitleProgressCard from './TitleProgressCard';

interface SportTitleGroupProps {
  template: SportTemplateRow;
  progress: TitleProgressResult[];
}

const SportTitleGroup: React.FC<SportTitleGroupProps> = ({ template, progress }) => {
  // Group by status category: in-progress, earned, locked
  const inProgress = progress.filter(p => !p.isEarned && p.prerequisiteMet && p.earnedLegs > 0);
  const nextEligible = progress.filter(p => !p.isEarned && p.prerequisiteMet && p.earnedLegs === 0);
  const earned = progress.filter(p => p.isEarned && !p.isSuperseded);
  const superseded = progress.filter(p => p.isEarned && p.isSuperseded);
  const locked = progress.filter(p => !p.isEarned && !p.prerequisiteMet);

  const hasAnyProgress = inProgress.length > 0 || earned.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h3 className="text-base font-semibold">
          {template.organization} {template.sport_name}
        </h3>
        {hasAnyProgress && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
            {earned.length} earned
          </span>
        )}
      </div>

      {/* In-progress titles (most prominent) */}
      {inProgress.length > 0 && (
        <div className="space-y-2">
          <SectionLabel>In Progress</SectionLabel>
          {inProgress.map(p => (
            <TitleProgressCard key={p.titleId} progress={p} />
          ))}
        </div>
      )}

      {/* Next eligible */}
      {nextEligible.length > 0 && (
        <div className="space-y-2">
          <SectionLabel>Next Eligible</SectionLabel>
          {nextEligible.map(p => (
            <TitleProgressCard key={p.titleId} progress={p} />
          ))}
        </div>
      )}

      {/* Earned titles */}
      {earned.length > 0 && (
        <div className="space-y-2">
          <SectionLabel>Earned</SectionLabel>
          <div className="space-y-1">
            {earned.map(p => (
              <TitleProgressCard key={p.titleId} progress={p} />
            ))}
          </div>
        </div>
      )}

      {/* Superseded (collapsed) */}
      {superseded.length > 0 && (
        <div className="space-y-1">
          <SectionLabel>Superseded</SectionLabel>
          {superseded.map(p => (
            <TitleProgressCard key={p.titleId} progress={p} />
          ))}
        </div>
      )}

      {/* Locked titles */}
      {locked.length > 0 && (
        <div className="space-y-1">
          <SectionLabel>Locked</SectionLabel>
          {locked.map(p => (
            <TitleProgressCard key={p.titleId} progress={p} />
          ))}
        </div>
      )}
    </div>
  );
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
      {children}
    </div>
  );
}

export default SportTitleGroup;
