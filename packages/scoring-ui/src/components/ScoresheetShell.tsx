/**
 * ScoresheetShell -- header, scrolling content and the pinned action bar that
 * every sport's live scoresheet is built from (MYK9-1501). One place owns the
 * phone layout, so a fix lands on all seven sports at once.
 */

import React, { type ReactNode } from 'react';
import { ScoresheetHeader, type ScoresheetHeaderProps } from './ScoresheetHeader';
import { ScoresheetActionBar, type ScoresheetActionBarProps } from './ScoresheetActionBar';

export interface ScoresheetShellProps {
  header: ScoresheetHeaderProps;
  actions: ScoresheetActionBarProps;
  children: ReactNode;
}

export const ScoresheetShell: React.FC<ScoresheetShellProps> = ({ header, actions, children }) => (
  <div className="min-h-screen bg-background">
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col">
      <ScoresheetHeader {...header} />
      <div className="flex-1 space-y-2 px-3 py-2">{children}</div>
      <ScoresheetActionBar {...actions} />
    </div>
  </div>
);
