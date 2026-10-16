import React from 'react';

/** The My Shows loading placeholder (kept out of `index.tsx`, which is at the line cap). */
export const EntriesLoadingSkeleton: React.FC = () => (
  <div className="bg-background">
    <div className="grid gap-8">
      <div className="h-8 bg-muted rounded-lg animate-pulse" />
      <div className="h-12 bg-muted rounded-lg animate-pulse" />
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />
        ))}
      </div>
    </div>
  </div>
);
