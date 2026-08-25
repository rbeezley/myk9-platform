/**
 * RoleSidebar — shared sidebar shell for all role-based consoles.
 *
 * Renders header, navigation groups, and footer from a declarative
 * SidebarConfig. Supports collapsed icon-rail mode.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { AccountMenu } from '@/components/layout/AccountMenu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SidebarConfig } from './types';
import { collectNavHrefs, useActivePath } from './useActivePath';

export interface RoleSidebarProps {
  config: SidebarConfig;
  onCloseMobile?: () => void;
  isCollapsed?: boolean;
}

export const RoleSidebar: React.FC<RoleSidebarProps> = ({ config, onCloseMobile, isCollapsed }) => {
  const { groups, accountName, accountRoleLabel } = config;

  // Pre-computed once per config identity (stable across renders since config is a module-level constant)
  const allHrefs = React.useMemo(() => collectNavHrefs(groups), [groups]);
  const isActive = useActivePath(allHrefs, config.dashboardHref);

  return (
    <div className="flex h-full flex-col bg-[var(--sidebar)] overflow-hidden">
      {/* Mobile sidebar close control. Desktop identity lives in the footer. */}
      {onCloseMobile && (
        <div className="flex h-16 items-center justify-end border-b border-border px-4 md:hidden">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCloseMobile}
            className="md:hidden min-h-[44px] min-w-[44px]"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Navigation */}
      <div className={cn('flex-1 overflow-y-auto py-6', isCollapsed ? 'px-2' : 'px-4')}>
        <nav className={cn(isCollapsed ? 'space-y-4' : 'space-y-8')}>
          {groups.map((group, groupIndex) => (
            <div key={groupIndex}>
              {groupIndex > 0 && !group.title && (
                <div
                  className={cn(
                    'border-t border-border/40',
                    isCollapsed ? 'mx-1 mb-3' : 'mx-2 mb-4'
                  )}
                />
              )}
              {!isCollapsed && group.title && (
                <h3 className="mb-3 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {group.title}
                </h3>
              )}
              <div className="space-y-1">
                {group.items.map(item => {
                  const active = isActive(item.href);
                  const badgeLabel = item.badge;
                  return (
                    <Link
                      // Multiple static nav items can intentionally share the same fallback href.
                      key={`${groupIndex}:${item.title}:${item.href}`}
                      to={item.href}
                      onClick={onCloseMobile}
                      aria-label={item.title}
                      aria-current={active ? 'page' : undefined}
                      title={isCollapsed ? item.title : undefined}
                      className={cn(
                        'group flex items-center gap-3 rounded-lg text-sm transition-all duration-200',
                        // Keyboard users had NO focus indicator here: the link
                        // carried hover styling only, so tabbing through the
                        // sidebar moved an invisible cursor (WCAG 2.4.7).
                        // Matches the ring pattern used elsewhere in the app.
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                        isCollapsed ? 'justify-center p-3' : 'min-h-11 px-3 py-2.5',
                        active
                          ? 'bg-gradient-to-r from-primary/10 to-primary/5 text-primary shadow-sm border-l-2 border-primary'
                          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                      )}
                    >
                      <div className="relative flex-shrink-0">
                        <item.icon
                          className={cn(
                            'transition-colors',
                            isCollapsed ? 'h-5 w-5' : 'h-4 w-4',
                            active
                              ? 'text-primary'
                              : 'text-muted-foreground group-hover:text-foreground'
                          )}
                        />
                      </div>
                      {!isCollapsed && (
                        <div className="flex-1 min-w-0">
                          <div
                            className={cn(
                              'font-medium transition-colors',
                              active ? 'text-primary' : ''
                            )}
                            style={{ fontWeight: active ? 500 : 400 }}
                          >
                            {item.title}
                          </div>
                          {item.description && (
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {item.description}
                            </div>
                          )}
                        </div>
                      )}
                      {!isCollapsed && badgeLabel && (
                        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          {badgeLabel}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      {/* Desktop account access; mobile keeps the trigger in AppHeader. */}
      <div className={cn('hidden border-t border-border md:block', isCollapsed ? 'p-2' : 'p-3')}>
        <AccountMenu
          variant="sidebar"
          displayName={accountName}
          roleLabel={accountRoleLabel}
          isCollapsed={Boolean(isCollapsed)}
        />
      </div>
    </div>
  );
};

export default RoleSidebar;
