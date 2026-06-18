/**
 * RowActionMenu — the canonical "3-dot" row/overflow action menu.
 *
 * Replaces the per-surface hand-rolled DropdownMenu clusters (EntryActionsMenu,
 * ClassRowActionsMenu, admin RowActions, the three ThreeDotMenu variants, …) with
 * one data-driven primitive. Callers describe their actions; the primitive owns the
 * trigger, a11y, touch sizing, destructive styling, and separator placement so those
 * stay consistent across every secretary/admin table.
 *
 * Design notes:
 * - Destructive items use the `text-destructive` THEME token, not `text-red-600`.
 *   `--destructive` is tuned to red-700 precisely so this token clears WCAG AA on
 *   popover surfaces in both themes (see src/index.css). Hard-coded red-600 did not.
 * - A separator is inserted automatically before the first destructive action when
 *   non-destructive actions precede it, so callers don't repeat that boilerplate.
 * - Items default to a 44px min height to satisfy the INTENT touch-target guardrail.
 */

import * as React from 'react';
import { MoreVertical, MoreHorizontal } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

export type RowActionVariant = 'default' | 'destructive' | 'warning';

export interface RowAction {
  /** Stable key for the item. */
  id: string;
  label: string;
  /** A lucide icon element (e.g. `<Eye />`) — no margin needed; the item lays it out. */
  icon?: React.ReactNode | undefined;
  onSelect: () => void;
  variant?: RowActionVariant | undefined;
  disabled?: boolean | undefined;
  /** Secondary muted line under the label (e.g. why an action is unavailable). */
  description?: string | undefined;
  /** Force a separator above this item (in addition to the auto destructive separator). */
  separatorBefore?: boolean | undefined;
  /** When true the action is omitted entirely — lets callers express conditional items inline. */
  hidden?: boolean | undefined;
  /** Escape hatch for one-off styling; merged after variant classes. */
  className?: string | undefined;
}

type TriggerSize = 'sm' | 'md' | 'touch';

export interface RowActionMenuProps {
  actions: RowAction[];
  /** Menu alignment relative to the trigger. */
  align?: 'start' | 'center' | 'end';
  /** Accessible label for the trigger button. Make it specific (e.g. "Actions for Fido"). */
  label?: string;
  /** Trigger glyph. Vertical dots is the default; horizontal matches admin tables. */
  icon?: 'vertical' | 'horizontal';
  size?: TriggerSize;
  triggerClassName?: string;
  contentClassName?: string;
  /** Disable the whole trigger. */
  disabled?: boolean;
  /** Controlled-open support (for externally triggered menus). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const TRIGGER_SIZE: Record<TriggerSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-9 w-9',
  touch: 'h-11 w-11',
};

const VARIANT_CLASS: Record<RowActionVariant, string> = {
  default: '',
  destructive: 'text-destructive focus:text-destructive',
  warning: 'text-amber-600 focus:text-amber-600',
};

export function RowActionMenu({
  actions,
  align = 'end',
  label = 'Row actions',
  icon = 'vertical',
  size = 'md',
  triggerClassName,
  contentClassName,
  disabled,
  open,
  onOpenChange,
}: RowActionMenuProps) {
  const visible = actions.filter(action => !action.hidden);
  if (visible.length === 0) return null;

  const firstDestructiveIdx = visible.findIndex(action => action.variant === 'destructive');
  const Glyph = icon === 'horizontal' ? MoreHorizontal : MoreVertical;
  const glyphSize = size === 'touch' ? 'h-5 w-5' : 'h-4 w-4';

  // Controlled vs uncontrolled: only pass open/onOpenChange when provided.
  const rootProps = {
    ...(open !== undefined ? { open } : {}),
    ...(onOpenChange ? { onOpenChange } : {}),
  };

  return (
    <DropdownMenu {...rootProps}>
      <DropdownMenuTrigger asChild nativeButton>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          disabled={disabled}
          className={cn(TRIGGER_SIZE[size], 'p-0 shrink-0', triggerClassName)}
        >
          <span className="sr-only">{label}</span>
          <Glyph className={glyphSize} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className={cn('w-48', contentClassName)}>
        {visible.map((action, index) => {
          const variant = action.variant ?? 'default';
          const autoSeparator =
            index === firstDestructiveIdx && firstDestructiveIdx > 0;
          const showSeparator = index > 0 && (action.separatorBefore || autoSeparator);
          // exactOptionalPropertyTypes: only pass these when defined, never `undefined`.
          const itemProps = {
            ...(action.disabled ? {} : { onClick: action.onSelect }),
            ...(action.disabled !== undefined ? { disabled: action.disabled } : {}),
          };
          return (
            <React.Fragment key={action.id}>
              {showSeparator && <DropdownMenuSeparator />}
              <DropdownMenuItem
                {...itemProps}
                className={cn(
                  'min-h-[44px] cursor-pointer',
                  action.description && 'items-start [&>svg]:mt-0.5',
                  VARIANT_CLASS[variant],
                  action.className
                )}
              >
                {action.icon}
                {action.description ? (
                  <span className="flex min-w-0 flex-col">
                    <span className="block">{action.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {action.description}
                    </span>
                  </span>
                ) : (
                  <span>{action.label}</span>
                )}
              </DropdownMenuItem>
            </React.Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default RowActionMenu;
