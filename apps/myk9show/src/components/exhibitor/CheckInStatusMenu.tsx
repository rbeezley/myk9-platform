/**
 * CheckInStatusMenu — Dropdown menu for selecting a check-in status.
 *
 * Shows exhibitor-allowed statuses (checked-in, conflict, pulled, at-gate, no-status).
 * Secretary-only statuses (come-to-gate, in-ring, completed) are never shown.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { CheckInStatus } from '@myk9/core';
import { getCheckinStatusConfig } from '@myk9/core';
import { Circle, Check } from 'lucide-react';
import { CheckInStatusBadge } from './CheckInStatusBadge';
import { CHECKIN_ICON_MAP } from './checkin-icons';

/** Status display order in the menu */
const MENU_ORDER: CheckInStatus[] = ['checked-in', 'at-gate', 'conflict', 'pulled', 'no-status'];

interface CheckInStatusMenuProps {
  /** Current status */
  status: CheckInStatus;
  /** Called when the user selects a new status */
  onStatusChange: (newStatus: CheckInStatus) => void;
  /** Disable the menu (e.g., self-check-in is off) */
  disabled?: boolean | undefined;
  /** Reason check-in is disabled (shown as tooltip/message) */
  disabledReason?: string | undefined;
  /** Additional class names for the trigger badge */
  className?: string | undefined;
}

export function CheckInStatusMenu({
  status,
  onStatusChange,
  disabled,
  disabledReason,
  className,
}: CheckInStatusMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);

  const closeAndRestoreFocus = useCallback(() => {
    setIsOpen(false);
    // Return focus to trigger so keyboard users don't lose their place
    requestAnimationFrame(() => {
      const btn = triggerRef.current?.querySelector(
        'button, [role="button"]'
      ) as HTMLElement | null;
      btn?.focus();
    });
  }, []);

  const handleSelect = (newStatus: CheckInStatus) => {
    if (newStatus !== status) {
      onStatusChange(newStatus);
    }
    closeAndRestoreFocus();
  };

  // Close on Escape key — listener only attached while open
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeAndRestoreFocus();
      }
    },
    [closeAndRestoreFocus]
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  return (
    <div className="relative" ref={triggerRef}>
      {/* Trigger */}
      <CheckInStatusBadge
        status={status}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={className}
      />

      {/* Disabled reason tooltip */}
      {disabled && disabledReason && <span className="sr-only">{disabledReason}</span>}

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={closeAndRestoreFocus} aria-hidden="true" />

          {/* Menu */}
          <div
            role="menu"
            aria-label="Check-in status options"
            className={cn(
              'absolute z-50 mt-1 w-56 rounded-xl border bg-popover p-1.5 shadow-lg',
              'animate-in fade-in-0 zoom-in-95 slide-in-from-top-2',
              // Position: prefer below, but flip up if near bottom
              'left-0 top-full'
            )}
          >
            {MENU_ORDER.map(optionStatus => {
              const config = getCheckinStatusConfig(optionStatus);
              if (!config) return null;
              const Icon = CHECKIN_ICON_MAP[config.icon] ?? Circle;
              const isActive = optionStatus === status;

              return (
                <button
                  key={optionStatus}
                  type="button"
                  role="menuitem"
                  onClick={() => handleSelect(optionStatus)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                    'hover:bg-accent focus-visible:bg-accent focus-visible:outline-none',
                    'min-h-[44px]',
                    isActive && 'bg-accent/50'
                  )}
                >
                  <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{config.label}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {config.description}
                    </div>
                  </div>
                  {isActive && <Check className="h-4 w-4 flex-shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
