import React, { useState } from 'react';
import { Plus, Trophy, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTitleProgress } from '@/hooks/useTitleProgress';
import SportTitleGroup from './SportTitleGroup';
import LogManualResultPanel from '@/components/panels/edit/LogManualResultPanel';
import type { SportTemplateRow } from '@/types/sport-template-types';
import type { TitleProgressResult } from '@/services/titleEngine';

interface TitleProgressSectionProps {
  dogId: string;
  ownerId: string;
}

interface OrgGroup {
  organization: string;
  sports: { template: SportTemplateRow; progress: TitleProgressResult[] }[];
}

const TitleProgressSection: React.FC<TitleProgressSectionProps> = ({ dogId, ownerId }) => {
  const { progressBySport, templates, isLoading } = useTitleProgress(dogId);
  const [panelOpen, setPanelOpen] = useState(false);

  const header = (
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-lg font-semibold">Title Progress</h3>
      <Button size="sm" variant="outline" onClick={() => setPanelOpen(true)}>
        <Plus className="h-4 w-4 mr-1" />
        Log Result
      </Button>
    </div>
  );

  if (isLoading) {
    return (
      <div className="mb-6">
        <div className="bg-background rounded-xl border p-6">
          {header}
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            Loading title progress...
          </div>
        </div>
      </div>
    );
  }

  const sportIds = Object.keys(progressBySport);

  // Group sports by organization
  const orgGroups: OrgGroup[] = [];
  const seenOrgs = new Set<string>();
  for (const sportId of sportIds) {
    const template = templates.find(t => t.id === sportId);
    if (!template) continue;
    const org = template.organization;
    if (!seenOrgs.has(org)) {
      seenOrgs.add(org);
      orgGroups.push({ organization: org, sports: [] });
    }
    orgGroups
      .find(g => g.organization === org)!
      .sports.push({
        template,
        progress: progressBySport[sportId],
      });
  }

  return (
    <>
      <div className="mb-6">
        <div className="bg-background rounded-xl border p-6">
          {header}

          {sportIds.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
              <Trophy className="w-10 h-10 opacity-40" />
              <p className="text-sm text-center">
                No title progress yet. Use &ldquo;Log Result&rdquo; to record a qualifying leg, or
                results from platform-managed trials will appear automatically.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {orgGroups.map(group => (
                <OrgSection key={group.organization} group={group} />
              ))}
            </div>
          )}
        </div>
      </div>

      <LogManualResultPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        dogId={dogId}
        ownerId={ownerId}
      />
    </>
  );
};

interface OrgSectionProps {
  group: OrgGroup;
}

const OrgSection: React.FC<OrgSectionProps> = ({ group }) => {
  const hasAnyProgress = group.sports.some(s =>
    s.progress.some(p => p.isEarned || p.earnedLegs > 0)
  );
  const [open, setOpen] = useState(hasAnyProgress);

  const totalEarned = group.sports.reduce(
    (sum, s) => sum + s.progress.filter(p => p.isEarned && !p.isSuperseded).length,
    0
  );

  return (
    <div className="rounded-xl border overflow-hidden">
      {/* Org header */}
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 w-full px-4 py-3 text-left bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
        <span className="font-semibold text-sm">{group.organization}</span>
        <span className="text-xs text-muted-foreground">
          {group.sports.length} {group.sports.length === 1 ? 'sport' : 'sports'}
        </span>
        {totalEarned > 0 && (
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
            {totalEarned} earned
          </span>
        )}
      </button>

      {/* Sports nested inside */}
      {open && (
        <div className="p-3 space-y-2">
          {group.sports.map(({ template, progress }) => (
            <SportTitleGroup key={template.id} template={template} progress={progress} />
          ))}
        </div>
      )}
    </div>
  );
};

export default TitleProgressSection;
