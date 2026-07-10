import type React from 'react';

export type Section =
  | 'profile'
  | 'dogs'
  | 'appearance'
  | 'general'
  | 'notifications'
  | 'privacy'
  | 'security'
  | 'data'
  | 'install'
  | 'delete';

export interface NavItem {
  key: Section;
  label: string;
  icon: React.FC<{ className?: string }>;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}
