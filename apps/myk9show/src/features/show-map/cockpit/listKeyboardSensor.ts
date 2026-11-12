import { KeyboardSensor, type KeyboardSensorProps } from '@dnd-kit/core';

/**
 * The scroll containers whose scrolling can move the list under a dragged row: everything inside
 * the nearest `position: sticky` ancestor (that ancestor included), or all of them when there is
 * none. A sticky panel stays put while the containers outside it scroll, so scrolling those never
 * brings the next row under the dragged one (MYK9-1902).
 */
export function scrollAncestorsThatMoveList(
  ancestors: readonly Element[],
  node: Element | null | undefined
): Element[] {
  let sticky: Element | null = null;
  for (let el = node?.parentElement ?? null; el; el = el.parentElement) {
    if (getComputedStyle(el).position === 'sticky') {
      sticky = el;
      break;
    }
  }
  if (!sticky) return [...ancestors];
  const stickyPanel = sticky;
  return ancestors.filter(el => el === stickyPanel || stickyPanel.contains(el));
}

/**
 * dnd-kit's KeyboardSensor, but it may only scroll containers that can move the list.
 *
 * When a move lands below the middle of a scrollable ancestor that can still scroll, the stock
 * sensor scrolls that ancestor instead of moving the row, trusting the scroll to bring the next
 * row under it. On Show Desk the entries sit in a sticky class panel inside a scrolling page
 * column: once the panel reached its bottom, the sensor scrolled the column, nothing moved, and
 * the ArrowDown press was lost. The coordinate getter still sees the full context, so how the
 * next row is chosen is unchanged.
 */
export class ListKeyboardSensor extends KeyboardSensor {
  constructor(props: KeyboardSensorProps) {
    const fullContext = props.context;
    const getter = props.options.coordinateGetter;
    super({
      ...props,
      context: {
        get current() {
          const context = fullContext.current;
          return {
            ...context,
            scrollableAncestors: scrollAncestorsThatMoveList(
              context.scrollableAncestors,
              context.activeNode
            ),
          };
        },
      },
      options: getter
        ? {
            ...props.options,
            coordinateGetter: (event, args) =>
              getter(event, { ...args, context: fullContext.current }),
          }
        : props.options,
    });
  }
}
