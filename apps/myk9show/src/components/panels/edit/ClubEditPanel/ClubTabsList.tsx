import React from 'react';
import { Building, Phone, Check } from 'lucide-react';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CLUB_TAB_LABEL,
  CLUB_TAB_ORDER,
  countInvalidFieldsByTab,
  countVisibleErrorsByTab,
  type ClubTabValue,
} from './validationTab';

interface ClubTabsListProps {
  mode: 'create' | 'edit';
  data: Record<string, unknown>;
  errors: Record<string, string | undefined>;
}

const TAB_ICON: Partial<Record<ClubTabValue, React.ReactNode>> = {
  basic: <Building className="h-4 w-4" />,
  contact: <Phone className="h-4 w-4" />,
};

/**
 * Tab strip with per-section status (MYK9-891). Each tab says what is left in
 * it: a red "N to fix" once the user has tried to save, and, while creating,
 * a muted "N required" or a check, so finishing Basic Info visibly leaves
 * Contact unfinished. Premium has no required fields and is marked Optional.
 */
export const ClubTabsList: React.FC<ClubTabsListProps> = ({ mode, data, errors }) => {
  const invalid = countInvalidFieldsByTab(data);
  const visible = countVisibleErrorsByTab(errors);

  return (
    <TabsList className="grid w-full grid-cols-3 bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1 transition-all duration-300 ease-out">
      {CLUB_TAB_ORDER.map(tab => {
        let status: React.ReactNode = null;
        if (visible[tab] > 0) {
          status = (
            <span
              data-testid={`club-tab-status-${tab}`}
              className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
            >
              {visible[tab]} to fix
            </span>
          );
        } else if (mode === 'create') {
          if (tab === 'premium') {
            status = (
              <span
                data-testid={`club-tab-status-${tab}`}
                className="text-xs text-muted-foreground"
              >
                Optional
              </span>
            );
          } else if (invalid[tab].empty + invalid[tab].malformed > 0) {
            const parts: string[] = [];
            if (invalid[tab].empty > 0) parts.push(`${invalid[tab].empty} required`);
            if (invalid[tab].malformed > 0) parts.push(`${invalid[tab].malformed} to fix`);
            status = (
              <span
                data-testid={`club-tab-status-${tab}`}
                className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning"
              >
                {parts.join(' · ')}
              </span>
            );
          } else {
            status = (
              <span data-testid={`club-tab-status-${tab}`} className="text-primary">
                <Check className="h-4 w-4" aria-label="Complete" />
              </span>
            );
          }
        }
        return (
          <TabsTrigger
            key={tab}
            value={tab}
            className="flex-wrap gap-x-2 rounded-lg transition-all duration-300"
          >
            {TAB_ICON[tab]}
            {CLUB_TAB_LABEL[tab]}
            {status}
          </TabsTrigger>
        );
      })}
    </TabsList>
  );
};
