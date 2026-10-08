import { act } from '@testing-library/react';
import { usePageEditTargetStore, type PageExtraAction } from '@/features/actions/pageEditTarget';

/**
 * What the detail page on screen registered for the header Actions menu (CRUD standard
 * decision 6): its Edit, if this viewer may edit, then its other actions, in menu order.
 * Rendering a real page and reading this proves the page offers the item to this viewer;
 * the registration-to-menu step is covered by `AppHeader.headerActions.test.tsx`.
 */
export function registeredPageActions(): string[] {
  const target = usePageEditTargetStore.getState().target;
  if (!target) return [];
  return [
    ...(target.canEdit ? [`Edit ${target.kind}`] : []),
    ...target.extras.map(extra => extra.label),
  ];
}

/** The registered extra whose label matches, as the menu would show it. */
export function registeredPageAction(label: string | RegExp): PageExtraAction | undefined {
  const target = usePageEditTargetStore.getState().target;
  return target?.extras.find(extra =>
    typeof label === 'string' ? extra.label === label : label.test(extra.label)
  );
}

/** Choose a registered extra, as clicking its menu row does. Throws when it is absent. */
export function runPageAction(label: string | RegExp): void {
  const extra = registeredPageAction(label);
  if (!extra) {
    throw new Error(
      `no page action matching ${String(label)}; registered: ${registeredPageActions().join(', ')}`
    );
  }
  act(() => extra.run());
}

/** Clear the registration between tests, as unmounting the page would. */
export function resetPageActions(): void {
  usePageEditTargetStore.setState({ target: null, owner: null });
}
