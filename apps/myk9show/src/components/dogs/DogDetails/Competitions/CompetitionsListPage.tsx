import React from 'react';
import SectionCard from '@/components/common/SectionCard';
import { Competition } from '@/types/competition-types';
import { useCompetitionStore } from '@/store/competitionStore';

const CompetitionsListPage: React.FC = () => {
  const competitions = useCompetitionStore(state => state.competitions);

  return (
    <SectionCard className="p-6">
      <h2 className="text-lg font-semibold mb-4">Competitions</h2>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {competitions.map((comp: Competition) => (
          <SectionCard key={comp.id} className="bg-muted">
            <div className="font-semibold">{comp.name}</div>
            <div className="text-xs text-muted-foreground">{comp.date} &mdash; {comp.location}</div>
            <div className="text-xs">{comp.status}</div>
          </SectionCard>
        ))}
      </div>
    </SectionCard>
  );
};

export default CompetitionsListPage;
