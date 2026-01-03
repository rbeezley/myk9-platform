import React from 'react';
import { useTitles } from '@/hooks/useTitles';
import SectionCard from '@/components/common/SectionCard';
import type { Title } from '@/hooks/useTitles';

const TitlesList: React.FC = () => {
  const { data, isLoading, error } = useTitles();

  if (isLoading) return <div className="p-8">Loading titles...</div>;
  if (error) return <div className="p-8 text-red-500">Error loading titles.</div>;

  return (
    <SectionCard className="p-6">
      <h2 className="text-lg font-semibold mb-4">Titles</h2>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {(data as Title[] ?? []).map((title: Title) => (
          <SectionCard key={title.id} className="bg-muted">
            <div className="font-semibold">{title.dogName}</div>
            <div className="text-xs text-muted-foreground">{title.title} &mdash; {title.organization}</div>
            <div className="text-xs">{title.dateEarned}</div>
            <div className="text-xs">{title.status}</div>
          </SectionCard>
        ))}
      </div>
    </SectionCard>
  );
};

export default TitlesList;
