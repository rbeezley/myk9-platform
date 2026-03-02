import React from 'react';
import { useTitleProgress } from '@/hooks/useTitleProgress';
import SportTitleGroup from './SportTitleGroup';
import { Trophy } from 'lucide-react';

interface TitleProgressSectionProps {
  dogId: string;
}

const TitleProgressSection: React.FC<TitleProgressSectionProps> = ({ dogId }) => {
  const { progressBySport, templates, isLoading } = useTitleProgress(dogId);

  if (isLoading) {
    return (
      <div className="mb-6">
        <div className="bg-background rounded-xl border p-6">
          <h3 className="text-lg font-semibold mb-4">Title Progress</h3>
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            Loading title progress...
          </div>
        </div>
      </div>
    );
  }

  const sportIds = Object.keys(progressBySport);

  if (sportIds.length === 0) {
    return (
      <div className="mb-6">
        <div className="bg-background rounded-xl border p-6">
          <h3 className="text-lg font-semibold mb-4">Title Progress</h3>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
            <Trophy className="w-10 h-10 opacity-40" />
            <p className="text-sm">
              No title progress yet. Qualifying results from trials will automatically track title
              progress.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="bg-background rounded-xl border p-6">
        <h3 className="text-lg font-semibold mb-4">Title Progress</h3>
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
      </div>
    </div>
  );
};

export default TitleProgressSection;
