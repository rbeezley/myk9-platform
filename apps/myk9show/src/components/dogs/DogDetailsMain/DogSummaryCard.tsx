import React from 'react';
import { Award } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { DogSummaryCardProps } from './types';

const DogSummaryCard: React.FC<DogSummaryCardProps> = ({ dog }) => {
  return (
    <Card className="group bg-gradient-to-br from-card/95 to-card/80 myk9-subtle-card-border
                     rounded-2xl p-6 shadow-md backdrop-blur-xl transition-all duration-500
                     hover:shadow-xl hover:-translate-y-1 hover:border-primary/20">
      <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.02] to-transparent
                      opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-2xl" />

      <div className="relative space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-gradient-to-br from-amber-500/10 to-amber-500/5 rounded-xl">
            <Award className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Dog Summary
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="flex flex-col items-center text-center p-4 bg-gradient-to-br
                         from-muted/30 to-muted/10 rounded-xl myk9-subtle-card-border
                         hover:scale-105 transition-all duration-300">
            <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase mb-2">
              Registrations
            </span>
            <span className="text-lg font-semibold text-foreground">
              {dog.registrations?.length || 0}
            </span>
          </div>

          <div className="flex flex-col items-center text-center p-4 bg-gradient-to-br
                         from-muted/30 to-muted/10 rounded-xl myk9-subtle-card-border
                         hover:scale-105 transition-all duration-300">
            <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase mb-2">
              Competitions
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              Coming soon
            </span>
          </div>

          <div className="flex flex-col items-center text-center p-4 bg-gradient-to-br
                         from-muted/30 to-muted/10 rounded-xl myk9-subtle-card-border
                         hover:scale-105 transition-all duration-300">
            <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase mb-2">
              Titles Earned
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              Coming soon
            </span>
          </div>

          <div className="flex flex-col items-center text-center p-4 bg-gradient-to-br
                         from-muted/30 to-muted/10 rounded-xl myk9-subtle-card-border
                         hover:scale-105 transition-all duration-300">
            <span className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase mb-2">
              Health Records
            </span>
            <span className="text-lg font-semibold text-foreground">
              {(dog.healthRecords?.vaccinations?.length || 0) +
                (dog.healthRecords?.medications?.length || 0) +
                (dog.healthRecords?.allergies?.length || 0)}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default DogSummaryCard;
