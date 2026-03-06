export type { NavItem, NavGroup, SidebarConfig } from './types';
export { collectNavHrefs, useActivePath } from './useActivePath';
export { RoleSidebar } from './RoleSidebar';
export type { RoleSidebarProps } from './RoleSidebar';
export { createRoleLayout } from './createRoleLayout';
export type { RoleLayoutOptions } from './createRoleLayout';

/** Convenience type for per-role sidebar wrapper components */
export type RoleSidebarWrapperProps = Omit<import('./RoleSidebar').RoleSidebarProps, 'config'>;
