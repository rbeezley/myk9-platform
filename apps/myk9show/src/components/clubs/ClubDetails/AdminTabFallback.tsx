import React from 'react';

/** Skeleton shown while an admin-only club tab's code loads (MYK9-1293). */
export const AdminTabFallback: React.FC<{ label: string }> = ({ label }) => (
  <div role="status" aria-label={label} className="space-y-4">
    <div className="h-7 w-40 animate-pulse rounded-md bg-muted" />
    <div className="h-28 animate-pulse rounded-xl bg-muted" />
  </div>
);
