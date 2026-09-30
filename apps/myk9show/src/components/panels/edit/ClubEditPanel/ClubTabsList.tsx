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

  // One polite live region. Its text only changes when a tab's count does, so
  // typing within a field announces nothing, and the footer's role=alert error
  // summary on a failed submit is not announced a second time (counts are the
  // same before and after the submit).
  const summary =
    mode === 'create'
      ? CLUB_TAB_ORDER.filter(tab => tab !== 'premium' && invalid[tab] > 0)
          .map(
            tab =>
              `${CLUB_TAB_LABEL[tab]}: ${invalid[tab]} ${invalid[tab] === 1 ? 'field' : 'fields'} to complete`
          )
          .join('. ')
      : '';

  return (
    <>
      <TabsList className="grid w-full grid-cols-3 bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1 transition-all duration-300 ease-out">
        {CLUB_TAB_ORDER.map(tab => {
          let status: React.ReactNode = null;
          const unresolved = invalid[tab];
          if (tab === 'premium') {
            if (mode === 'create') {
              status = (
                <span
                  data-testid={`club-tab-status-${tab}`}
                  className="text-xs text-muted-foreground"
                >
                  Optional
                </span>
              );
            }
          } else if (unresolved > 0 && (mode === 'create' || visible[tab] > 0)) {
            // One count, one label. It turns red once a save has been attempted
            // (or the field was touched), so the wording never changes under the user.
            status = (
              <span
                data-testid={`club-tab-status-${tab}`}
                data-error={visible[tab] > 0 || undefined}
                className={
                  visible[tab] > 0
                    ? 'rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive'
                    : 'rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning'
                }
              >
                {/* Below sm the column is too narrow for the phrase: show the bare
                  count, keep the full phrase as the accessible name. */}
                <span aria-hidden className="sm:hidden">
                  {unresolved}
                </span>
                <span className="sr-only sm:not-sr-only">{unresolved} to complete</span>
              </span>
            );
          } else if (mode === 'create') {
            status = (
              <span data-testid={`club-tab-status-${tab}`} className="text-primary">
                <Check className="h-4 w-4" aria-label="Complete" />
              </span>
            );
          }
          return (
            <TabsTrigger
              key={tab}
              value={tab}
              className="flex-wrap justify-center gap-x-1.5 gap-y-0 whitespace-normal rounded-lg px-1.5 transition-all duration-300 sm:gap-x-2 sm:px-4"
            >
              {TAB_ICON[tab]}
              {CLUB_TAB_LABEL[tab]}
              {/* Explicit space so the accessible name reads "Contact 6 to complete". */}
              {status && ' '}
              {status}
            </TabsTrigger>
          );
        })}
      </TabsList>
      {mode === 'create' && (
        <p aria-live="polite" className="sr-only" data-testid="club-tab-summary">
          {summary}
        </p>
      )}
    </>
  );
};
