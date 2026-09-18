/**
 * The one actions list a My Shows show card offers (MYK9-631 AC2).
 *
 * Pure: it turns the facts the card already derived into the ordered menu
 * items, so "what is offered, and when" is testable without rendering a
 * dropdown. The component beside it owns nothing but the trigger and the
 * rendering.
 *
 * Two rules from `docs/plan-secretary-show-actions.md` are encoded here rather
 * than argued again per caller:
 *
 *  - **Placement rule.** A verb a status banner already carries does not get a
 *    second home in the menu. That is why `Finish payment` is absent: the
 *    yellow money strip keeps its own button (retitled to the amount), and
 *    `Dismiss` stays on the green strip it dismisses.
 *  - **Row verbs stay on rows.** Leaving a class is a per-class act, so it is a
 *    control on `MyShowClassRow`, not a menu item that would open a picker —
 *    which is exactly the order picker MYK9-631 is deleting.
 *
 * @module MyEntriesPage/modules/myShowActions
 */

export type MyShowActionId =
  'add-classes' | 'edit-entry' | 'receipts' | 'add-to-calendar' | 'message-show-team' | 'view-show';

/** A menu item, resolved to either a navigation target or a dialog-opening id. */
export interface MyShowAction {
  id: MyShowActionId;
  label: string;
  /** Present for the link items; absent for the ones that open a dialog. */
  href?: string;
  /** Screen-reader name, when the visible label needs the show's name added. */
  ariaLabel?: string;
}

export interface MyShowActionsFacts {
  showId: string;
  showName: string;
  /** True once the exhibitor holds at least one order still inside its edit window. */
  hasEditableOrders: boolean;
  /** True once the show holds any order at all — a receipt needs one. */
  hasOrders: boolean;
  /**
   * The show has finished. "Add classes" is meaningless afterwards, and the
   * registration wizard would refuse it anyway.
   */
  isPastShow: boolean;
}

/**
 * The card's menu, in the order MYK9-631 fixed, with every inapplicable item
 * already dropped.
 *
 * An empty `showId` is the partial-replication window — `/shows/` and
 * `/messages/` with nothing after them are dead links — so every showId-bound
 * item carries that guard, exactly as the controls it replaces did.
 */
export function buildMyShowActions(facts: MyShowActionsFacts): MyShowAction[] {
  const actions: MyShowAction[] = [];
  const hasShow = facts.showId !== '';

  // A LINK to the wizard's entry point, never a second registration surface
  // (MYK9-631 Q3). The show page owns "which classes are still open".
  if (hasShow && facts.hasEditableOrders && !facts.isPastShow) {
    actions.push({
      id: 'add-classes',
      label: 'Add classes',
      href: `/shows/${facts.showId}`,
      ariaLabel: `Add classes at ${facts.showName}`,
    });
  }

  // Named for what it now does. Leaving a class moved to the class row, so the
  // sheet behind this item is handler and jump height and nothing else — and
  // the label says so, rather than hiding a withdrawal behind "Edit".
  if (facts.hasEditableOrders) {
    actions.push({ id: 'edit-entry', label: 'Change handler or jump height' });
  }

  // Offered on every order, paid or not: a pending, cash or check order still
  // has a card-derived receipt, and withholding a receipt is the one thing
  // that makes a real payment look lost.
  if (facts.hasOrders) {
    actions.push({ id: 'receipts', label: 'Receipts' });
  }

  if (hasShow) {
    actions.push({ id: 'add-to-calendar', label: 'Add to calendar' });
    // ALWAYS, not only after entries close (the pre-MYK9-631 gate). An
    // exhibitor with a question before the deadline had nowhere to ask it.
    actions.push({
      id: 'message-show-team',
      label: 'Message the show team',
      href: `/messages/${facts.showId}`,
      ariaLabel: `Message the show team about ${facts.showName}`,
    });
    actions.push({
      id: 'view-show',
      label: 'View show page',
      href: `/shows/${facts.showId}`,
      ariaLabel: `View the show page for ${facts.showName}`,
    });
  }

  return actions;
}
