import React, { useState } from 'react';
import { Plus, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTitleProgress } from '@/hooks/useTitleProgress';
import SportTitleGroup from './SportTitleGroup';
import LogManualResultPanel from '@/components/panels/edit/LogManualResultPanel';

interface TitleProgressSectionProps {
  dogId: string;
  ownerId: string;
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
            <div className="space-y-8">
              {sportIds.map(sportId => {
                const template = templates.find(t => t.id === sportId);
                if (!template) return null;
                return (
                  <SportTitleGroup
                    key={sportId}
                    template={template}
                    progress={progressBySport[sportId]}
                  />
                );
              })}
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

export default TitleProgressSection;
