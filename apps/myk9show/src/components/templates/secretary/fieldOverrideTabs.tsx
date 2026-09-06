import React from 'react';
import { Clock, DollarSign, Edit, Settings, Users } from 'lucide-react';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';

export type FieldOverrideTabKey =
  'basic' | 'financial' | 'timing' | 'personnel' | 'rules' | 'other';

interface FieldOverrideTabDefinition {
  key: FieldOverrideTabKey;
  /** Visible wording inside the tab. Kept visible at every width. */
  label: string;
  /**
   * Accessible name. Always present regardless of viewport width so the tab is
   * never announced as an unnamed control, and always contains the visible
   * label so speech input still matches what a secretary can read (WCAG 2.5.3).
   */
  accessibleName: string;
  icon: React.ReactNode;
}

const iconClass = 'h-4 w-4 shrink-0';

export const FIELD_OVERRIDE_TABS: readonly FieldOverrideTabDefinition[] = [
  {
    key: 'basic',
    label: 'Basic',
    accessibleName: 'Basic overrides',
    icon: <Edit className={iconClass} aria-hidden="true" />,
  },
  {
    key: 'financial',
    label: 'Financial',
    accessibleName: 'Financial overrides',
    icon: <DollarSign className={iconClass} aria-hidden="true" />,
  },
  {
    key: 'timing',
    label: 'Timing',
    accessibleName: 'Timing overrides',
    icon: <Clock className={iconClass} aria-hidden="true" />,
  },
  {
    key: 'personnel',
    label: 'Personnel',
    accessibleName: 'Personnel overrides',
    icon: <Users className={iconClass} aria-hidden="true" />,
  },
  {
    key: 'rules',
    label: 'Rules',
    accessibleName: 'Rules overrides',
    icon: <Settings className={iconClass} aria-hidden="true" />,
  },
  {
    key: 'other',
    label: 'Other',
    accessibleName: 'Other overrides',
    icon: <Edit className={iconClass} aria-hidden="true" />,
  },
] as const;

/**
 * The override tab strip.
 *
 * Every tab keeps its words at every width. The strip wraps onto as many rows
 * as it needs instead of hiding the labels behind icons, so at 390px wide all
 * six tabs are readable at once, each keeps its 44px touch target, and nothing
 * is clipped or scrolled out of reach. At desktop widths they share one row as
 * before.
 */
export const FieldOverrideTabsList: React.FC = () => (
  <TabsList className="flex w-full flex-wrap gap-1 p-1.5">
    {FIELD_OVERRIDE_TABS.map(tab => (
      <TabsTrigger
        key={tab.key}
        value={tab.key}
        aria-label={tab.accessibleName}
        className="flex flex-1 basis-auto items-center gap-1.5 px-3 sm:px-4"
      >
        {tab.icon}
        <span>{tab.label}</span>
      </TabsTrigger>
    ))}
  </TabsList>
);
