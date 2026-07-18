/**
 * EntityAction<TItem, THandlers> — a typed action definition domains project into
 * RowActionMenu's `RowAction[]` for both the single-row menu and the bulk-selection
 * menu, so the two surfaces can't silently drift (see openspec change
 * `inline-bulk-actions-and-editable-status`, design.md decision D1).
 *
 * Handlers are injected at resolve time (`toRowActions`/`toBulkActions`), never
 * captured inside the action definition — the definitions stay pure data, and a
 * single definitions array works for every render regardless of which callbacks
 * a given page wired up.
 *
 * Deliberately has no permission/RBAC field: gating stays at the route + prop
 * level (e.g. `canManageShow`), not baked into the action catalog.
 */

import type { RowAction, RowActionVariant } from './RowActionMenu';

export interface EntityAction<TItem, THandlers> {
  id: string;
  /** Static label, or a function of the item for state-dependent copy (e.g. "Assign armband" vs "Change armband"). */
  label: string | ((item: TItem) => string);
  icon?: React.ReactNode;
  sectionLabel?: string;
  variant?: RowActionVariant;
  /** Whether this action applies to the item at all (drives row-menu visibility and bulk eligibility by default). */
  applicableWhen: (item: TItem, handlers: THandlers) => boolean;
  /** Whether an applicable action should render disabled in the row menu (e.g. missing handler, external lock). */
  disabledWhen?: (item: TItem, handlers: THandlers) => boolean;
  /** Row-menu handler for a single item. */
  run: (item: TItem, handlers: THandlers) => void;
  /** Present when this action is also offered in the bulk-selection menu. */
  bulk?: {
    /** Eligibility for the bulk menu, if different from `applicableWhen` (e.g. bulk excludes closed/terminal states row actions still allow). Defaults to `applicableWhen`. */
    applicableWhen?: (item: TItem, handlers: THandlers) => boolean;
    /** Bulk-menu label, given the count of eligible-of-selected items. */
    label: (eligibleCount: number, selectedCount: number) => string;
    /** Muted description shown when no selected items are eligible. */
    unavailableReason?: string;
    run: (eligibleItems: TItem[], handlers: THandlers) => void | Promise<void>;
  };
}

/** Project a single item's applicable actions into RowActionMenu's RowAction[]. */
export function toRowActions<TItem, THandlers>(
  item: TItem,
  handlers: THandlers,
  actions: ReadonlyArray<EntityAction<TItem, THandlers>>
): RowAction[] {
  return actions.map(action => ({
    id: action.id,
    label: typeof action.label === 'function' ? action.label(item) : action.label,
    icon: action.icon,
    sectionLabel: action.sectionLabel,
    variant: action.variant,
    hidden: !action.applicableWhen(item, handlers),
    disabled: action.disabledWhen ? action.disabledWhen(item, handlers) : undefined,
    onSelect: () => action.run(item, handlers),
  }));
}

/**
 * Project the actions that opt into a bulk equivalent (`bulk` is set) into
 * RowActionMenu's RowAction[], narrowed to each action's eligible-of-selected
 * subset. `disabled`/`unavailableReason` (as `description`) surface when zero
 * selected items are eligible.
 */
export function toBulkActions<TItem, THandlers>(
  selectedItems: ReadonlyArray<TItem>,
  handlers: THandlers,
  actions: ReadonlyArray<EntityAction<TItem, THandlers>>
): RowAction[] {
  return actions
    .filter(
      (
        action
      ): action is EntityAction<TItem, THandlers> & {
        bulk: NonNullable<EntityAction<TItem, THandlers>['bulk']>;
      } => Boolean(action.bulk)
    )
    .map(action => {
      const isEligible = action.bulk.applicableWhen ?? action.applicableWhen;
      const eligible = selectedItems.filter(item => isEligible(item, handlers));
      const eligibleCount = eligible.length;

      return {
        id: action.id,
        label: action.bulk.label(eligibleCount, selectedItems.length),
        icon: action.icon,
        variant: action.variant,
        disabled: eligibleCount === 0,
        description: eligibleCount === 0 ? action.bulk.unavailableReason : undefined,
        onSelect: () => {
          void action.bulk.run(eligible, handlers);
        },
      };
    });
}
