import React from 'react';

export interface ClubOfficialsLineProps {
  adminNames: string[];
  secretaryNames: string[];
}

/** Renders nothing when this viewer gets no officials back (MYK9-860). */
export const ClubOfficialsLine: React.FC<ClubOfficialsLineProps> = ({
  adminNames,
  secretaryNames,
}) => {
  if (adminNames.length === 0 && secretaryNames.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground mb-2">
      {adminNames.length > 0 && (
        <span data-testid="club-admin-names">
          <span className="font-medium text-foreground">
            {adminNames.length > 1 ? 'Admins' : 'Admin'}:
          </span>{' '}
          {adminNames.join(', ')}
        </span>
      )}
      {secretaryNames.length > 0 && (
        <span data-testid="club-secretary-names">
          <span className="font-medium text-foreground">
            {secretaryNames.length > 1 ? 'Secretaries' : 'Secretary'}:
          </span>{' '}
          {secretaryNames.join(', ')}
        </span>
      )}
    </div>
  );
};
