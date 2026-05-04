import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { TitleProgressResult } from '@/services/titleEngine';
import type { SportTemplateRow } from '@/types/sport-template-types';
import TitleProgressCard from './TitleProgressCard';

interface SportTitleGroupProps {
  template: SportTemplateRow;
  progress: TitleProgressResult[];
}

const SportTitleGroup: React.FC<SportTitleGroupProps> = ({ template, progress }) => {
  const inProgress = progress.filter(p => !p.isEarned && p.prerequisiteMet && p.earnedLegs > 0);
  const nextEligible = progress.filter(p => !p.isEarned && p.prerequisiteMet && p.earnedLegs === 0);
  const earned = progress.filter(p => p.isEarned && !p.isSuperseded);
  const superseded = progress.filter(p => p.isEarned && p.isSuperseded);
  const locked = progress.filter(p => !p.isEarned && !p.prerequisiteMet);

  const hasAnyProgress = inProgress.length > 0 || earned.length > 0;
  const [open, setOpen] = useState(hasAnyProgress);

  return (
    <div className="rounded-lg border bg-background">
      {/* Sport header — always visible, toggles content */}
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 w-full px-4 py-3 text-left"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
        <span className="text-sm font-semibold">{template.sport_name}</span>
        {hasAnyProgress && (
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
            {earned.length} earned
          </span>
        )}
        {!hasAnyProgress && inProgress.length === 0 && (
          <span className="ml-auto text-xs text-muted-foreground">No activity yet</span>
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t pt-3">
          {inProgress.length > 0 && (
            <div className="space-y-2">
              <SectionLabel>In Progress</SectionLabel>
              {inProgress.map(p => (
                <TitleProgressCard key={p.titleId} progress={p} />
              ))}
            </div>
          )}

          {nextEligible.length > 0 && (
            <div className="space-y-2">
              <SectionLabel>Next Eligible</SectionLabel>
              {nextEligible.map(p => (
                <TitleProgressCard key={p.titleId} progress={p} />
              ))}
            </div>
          )}

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

          {superseded.length > 0 && (
            <div className="space-y-1">
              <SectionLabel>Superseded</SectionLabel>
              {superseded.map(p => (
                <TitleProgressCard key={p.titleId} progress={p} />
              ))}
            </div>
          )}

          {locked.length > 0 && (
            <div className="space-y-1">
              <SectionLabel>Locked</SectionLabel>
              {locked.map(p => (
                <TitleProgressCard key={p.titleId} progress={p} />
              ))}
            </div>
          )}
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
