import type React from 'react';

/** A collapsible section of label-value property rows for the left sidebar. */
export interface PropertySectionConfig {
  key: string;
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** Gradient color for the icon container (e.g., "from-pink-500/10 to-rose-500/5"). */
  iconGradient?: string;
  /** Icon text color (e.g., "text-pink-500"). */
  iconColor?: string;
  fields: PropertyField[];
}

export interface PropertyField {
  label: string;
  value: string | number | null | undefined;
  /** Custom render for the value. If omitted, renders `value` as text. */
  render?: React.ReactNode;
  /** Enable inline editing. Called with the new value; should throw on failure. */
  onSave?: (value: string) => Promise<void>;
  /** Input type for inline editing (default: 'text'). */
  fieldType?: 'text' | 'number' | 'date' | 'select';
  /** Options for select-type inline fields. */
  options?: Array<{ label: string; value: string }>;
  /** Suffix appended to display value (e.g., "lbs"). */
  suffix?: string;
}

/** A compact card linking to a related record in the right sidebar. */
export interface AssociationConfig {
  key: string;
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  href?: string;
  onClick?: () => void;
  badge?: string;
}

/** Tab definition for the center panel. */
export interface RecordTab {
  key: string;
  label: string;
  content: React.ReactNode;
}

export interface RecordPageLayoutProps {
  /** Breadcrumb component rendered at the top-left. */
  breadcrumb?: React.ReactNode;
  /** Action buttons rendered at the top-right. */
  actions?: React.ReactNode;
  /** Stat cards row below the breadcrumb bar. */
  stats?: React.ReactNode;
  /** Hero/profile section rendered above the three-panel body. */
  hero?: React.ReactNode;
  /** Property sections for the left sidebar. */
  properties?: PropertySectionConfig[];
  /** Tabs for the center panel. */
  tabs?: RecordTab[];
  /** Pre-built tabs content — pass this instead of `tabs` when the page
   *  already has a fully rendered Tabs component. */
  tabsContent?: React.ReactNode;
  /** Association cards for the right sidebar. */
  associations?: AssociationConfig[];
  /** Extra content below associations in the right sidebar. */
  associationsExtra?: React.ReactNode;
  /** localStorage key prefix for collapsible section state (defaults to "myk9:prop"). */
  storageKey?: string;
  /** Class name for the outer container. */
  className?: string;
}
