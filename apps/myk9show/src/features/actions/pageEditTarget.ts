import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import type { EditableObjectKind } from './actionRegistry';

/**
 * What the detail page on screen has told the header Actions menu (MYK9-928).
 *
 * A trial, class, club, dog or person page owns its Edit panel and knows whether
 * THIS viewer may use it -- the gate its old Edit button carried. Registering
 * here, instead of the header re-deriving that gate, means the menu item and the
 * button it replaced can never disagree, and the header pays for no per-object
 * reads on every other page.
 */
export interface PageEditTarget {
  kind: EditableObjectKind;
  /** Opens the object's Edit panel. */
  run: () => void;
  /** Trial pages only: where "Add classes" goes for this viewer. */
  addClassesHref?: string | undefined;
}

interface PageEditTargetState {
  target: PageEditTarget | null;
  /** The registration that currently owns `target`, so a stale cleanup cannot clear a newer one. */
  owner: symbol | null;
  register: (owner: symbol, target: PageEditTarget) => void;
  clear: (owner: symbol) => void;
}

export const usePageEditTargetStore = create<PageEditTargetState>(set => ({
  target: null,
  owner: null,
  register: (owner, target) => set({ owner, target }),
  clear: owner => set(state => (state.owner === owner ? { owner: null, target: null } : state)),
}));

export interface PageEditActionOptions {
  kind: EditableObjectKind;
  /**
   * The page's own "may this viewer edit this object" gate. False registers
   * nothing, so the menu item is absent rather than greyed.
   */
  enabled: boolean;
  run: () => void;
  addClassesHref?: string | undefined;
}

/**
 * Register the page's Edit action for the header Actions menu and the command
 * palette while the page is mounted and `enabled`. `run` may change identity
 * every render; the registered callback always calls the latest one.
 */
export function usePageEditAction({
  kind,
  enabled,
  run,
  addClassesHref,
}: PageEditActionOptions): void {
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });

  useEffect(() => {
    if (!enabled) return;
    const owner = Symbol(kind);
    usePageEditTargetStore.getState().register(owner, {
      kind,
      run: () => runRef.current(),
      addClassesHref,
    });
    return () => usePageEditTargetStore.getState().clear(owner);
  }, [kind, enabled, addClassesHref]);
}
