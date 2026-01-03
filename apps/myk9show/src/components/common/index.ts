/**
 * Design System Component Library
 * 
 * Centralized exports for all Apple-inspired design system components.
 * Import from here to ensure consistent usage across the application.
 */

// Layout Components
export { 
  DashboardLayout,
  StatsDashboardLayout,
  createRefreshAction,
  createExportAction,
  createSettingsAction,
  createPrimaryAction
} from '../layouts/DashboardLayout';

export {
  StandardPageLayout,
  DetailPageLayout,
  ListPageLayout,
  FormPageLayout
} from '../layouts/StandardPageLayout';

// Navigation Components
export {
  PremiumTabBar,
  usePremiumTabs,
  createDashboardTabs,
  createEntityTabs,
  createShowTabs
} from './PremiumTabBar';

// Card Components
export {
  PremiumCard,
  FeatureCard,
  StatsCard,
  ShowCard
} from './PremiumCard';

// Button Components
export {
  PremiumButton,
  CTAButton,
  IconButton,
  ButtonGroup,
  FloatingActionButton
} from './PremiumButton';

// Icon Components
export {
  IconContainer,
  StatusIcon,
  FeatureIcon,
  MetricIcon,
  IconGrid,
  QuickActionIcon
} from './IconContainer';

// State Components
export {
  EmptyState,
  NoDataEmptyState,
  SearchEmptyState,
  ErrorEmptyState,
  LoadingEmptyState,
  MaintenanceEmptyState,
  PermissionEmptyState
} from './EmptyState';

// Type Exports
export type { 
  DashboardLayoutProps,
  DashboardAction,
  StatsDashboardLayoutProps 
} from '../layouts/DashboardLayout';

export type {
  StandardPageLayoutProps,
  DetailPageLayoutProps,
  ListPageLayoutProps,
  FormPageLayoutProps,
  BreadcrumbItem,
  PageAction
} from '../layouts/StandardPageLayout';

export type {
  PremiumTabBarProps,
  TabItem
} from './PremiumTabBar';

export type {
  PremiumCardProps,
  FeatureCardProps,
  StatsCardProps,
  ShowCardProps
} from './PremiumCard';

export type {
  PremiumButtonProps,
  CTAButtonProps,
  IconButtonProps,
  ButtonGroupProps,
  FABProps
} from './PremiumButton';

export type {
  IconContainerProps,
  StatusIconProps,
  FeatureIconProps,
  MetricIconProps,
  IconGridProps,
  QuickActionIconProps
} from './IconContainer';

export type {
  EmptyStateProps,
  NoDataEmptyStateProps,
  SearchEmptyStateProps,
  ErrorEmptyStateProps,
  LoadingEmptyStateProps,
  MaintenanceEmptyStateProps,
  PermissionEmptyStateProps
} from './EmptyState';