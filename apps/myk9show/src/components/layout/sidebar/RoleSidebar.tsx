/**
 * RoleSidebar — shared sidebar shell for all role-based consoles.
 *
 * Renders header, navigation groups, and footer from a declarative
 * SidebarConfig. Supports collapsed icon-rail mode.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SidebarConfig } from './types';
import { collectNavHrefs, useActivePath } from './useActivePath';
import { useMessageStore } from '@/store/messageStore';

export interface RoleSidebarProps {
  config: SidebarConfig;
  onCloseMobile?: () => void;
  isCollapsed?: boolean;
}

export const RoleSidebar: React.FC<RoleSidebarProps> = ({ config, onCloseMobile, isCollapsed }) => {
  const {
    groups,
    headerIcon: HeaderIcon,
    headerTitle,
    footerIcon: FooterIcon,
    footerLabel,
    footerDescription,
  } = config;

  // Pre-computed once per config identity (stable across renders since config is a module-level constant)
  const allHrefs = React.useMemo(() => collectNavHrefs(groups), [groups]);
  const isActive = useActivePath(allHrefs, config.dashboardHref);
  const messageUnreadCount = useMessageStore(s => s.unreadCount);

  return (
    <div className="flex h-full flex-col bg-[var(--sidebar)] overflow-hidden">
      {/* Header */}
      <div
        className={cn(
          'flex h-16 items-center border-b border-border',
          isCollapsed ? 'justify-center px-0' : 'justify-between px-6'
        )}
      >
        <div className={cn('flex items-center', isCollapsed ? '' : 'gap-3')}>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-secondary shadow-sm">
            <HeaderIcon className="h-4 w-4 text-primary-foreground" />
          </div>
          {!isCollapsed && (
            <div>
              <h2 className="text-base font-semibold" style={{ fontWeight: 590 }}>
                {headerTitle}
              </h2>
            </div>
          )}
        </div>
        {!isCollapsed && onCloseMobile && (
          <Button variant="ghost" size="sm" onClick={onCloseMobile} className="md:hidden">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

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
                  // Messages items show a live unread count badge
                  const isMessagesItem = item.href.endsWith('/messages');
                  const dynamicBadgeCount = isMessagesItem ? messageUnreadCount : 0;
                  const badgeLabel =
                    item.badge ??
                    (dynamicBadgeCount > 0
                      ? String(dynamicBadgeCount > 99 ? '99+' : dynamicBadgeCount)
                      : undefined);
                  return (
                    <Link
                      // Multiple static nav items can intentionally share the same fallback href.
                      key={`${groupIndex}:${item.title}:${item.href}`}
                      to={item.href}
                      onClick={onCloseMobile}
                      aria-label={isCollapsed ? item.title : undefined}
                      title={isCollapsed ? item.title : undefined}
                      className={cn(
                        'group flex items-center gap-3 rounded-lg text-sm transition-all duration-200',
                        isCollapsed ? 'justify-center p-3' : 'px-3 py-2.5',
                        active
                          ? 'bg-gradient-to-r from-primary/10 to-primary/5 text-primary shadow-sm border-l-2 border-primary'
                          : 'text-[#a09f98] hover:bg-muted/50 hover:text-foreground'
                      )}
                    >
                      <div className="relative flex-shrink-0">
                        <item.icon
                          className={cn(
                            'transition-colors',
                            isCollapsed ? 'h-5 w-5' : 'h-4 w-4',
                            active ? 'text-primary' : 'text-[#a09f98] group-hover:text-foreground'
                          )}
                        />
                        {isCollapsed && dynamicBadgeCount > 0 && (
                          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
                            {dynamicBadgeCount > 9 ? '9+' : dynamicBadgeCount}
                          </span>
                        )}
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
                            <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
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

      {/* Footer */}
      <div className="border-t border-border p-4">
        {isCollapsed ? (
          <div className="flex justify-center">
            <FooterIcon className="h-5 w-5 text-primary" />
          </div>
        ) : (
          <div className="rounded-lg bg-muted/30 p-3">
            <div className="flex items-center gap-2 mb-1">
              <FooterIcon className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium" style={{ fontWeight: 500 }}>
                {footerLabel}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{footerDescription}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RoleSidebar;
