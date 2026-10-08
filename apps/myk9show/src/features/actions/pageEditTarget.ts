import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import type { EditableObjectKind, PageExtraItem } from './actionRegistry';

/**
 * What the detail page on screen has told the header Actions menu (MYK9-928).
 *
 * A trial, class, club, dog or person page owns its Edit panel and knows whether
 * THIS viewer may use it -- the gate its old Edit button carried. Registering
 * here, instead of the header re-deriving that gate, means the menu item and the
 * button it replaced can never disagree, and the header pays for no per-object
 * reads on every other page.
 */
/** A page's extra action with the callback that performs it. */
export interface PageExtraAction extends PageExtraItem {
  run: () => void;
}

export interface PageEditTarget {
  kind: EditableObjectKind;
  /** Whether Edit is offered; the page may register only extras (see `PageObject.canEdit`). */
  canEdit: boolean;
  /** Opens the object's Edit panel. */
  run: () => void;
  /** Trial pages only: where "Add classes" goes for this viewer. */
  addClassesHref?: string | undefined;
  /** The object's display name, which heads its section of the menu ("Richard Beezley"). */
  title?: string | undefined;
  /** The page's other actions on its object, each already gated for this viewer. */
  extras: PageExtraAction[];
}

/** A whole-list "Export CSV" a list page offers the header Actions menu (MYK9-929). */
export interface PageExport {
  /** Unique per registration, so a stale cleanup cannot clear a newer one. */
  key: symbol;
  /** Which list ('dogs', 'classes', ...). One export per id on screen. */
  id: string;
  run: () => void;
}

interface PageEditTargetState {
  target: PageEditTarget | null;
  exports: PageExport[];
  /** The registration that currently owns `target`, so a stale cleanup cannot clear a newer one. */
  owner: symbol | null;
  /** Setup -> Classes' selected trial, so the show-wide "Add classes" opens focused on it. */
  addClassesTrialId: string | null;
  setAddClassesTrialId: (trialId: string | null) => void;
  register: (owner: symbol, target: PageEditTarget) => void;
  clear: (owner: symbol) => void;
  registerExport: (item: PageExport) => void;
  clearExport: (key: symbol) => void;
}

export const usePageEditTargetStore = create<PageEditTargetState>(set => ({
  target: null,
  exports: [],
  owner: null,
  addClassesTrialId: null,
  setAddClassesTrialId: addClassesTrialId => set({ addClassesTrialId }),
  register: (owner, target) => set({ owner, target }),
  clear: owner => set(state => (state.owner === owner ? { owner: null, target: null } : state)),
  registerExport: item =>
    set(state => ({ exports: [...state.exports.filter(other => other.id !== item.id), item] })),
  clearExport: key => set(state => ({ exports: state.exports.filter(item => item.key !== key) })),
}));

export interface PageEditActionOptions {
  kind: EditableObjectKind;
  /**
   * The page's own "may this viewer edit this object" gate. False leaves Edit out, so the
   * item is absent rather than greyed; the page's extras still register.
   */
  enabled: boolean;
  run: () => void;
  addClassesHref?: string | undefined;
  /** The object's display name, for its menu section heading. Absent while it loads. */
  title?: string | undefined;
  /**
   * The page's other actions on its object (Change Photo, Suspend account...), each ALREADY
   * gated: list only what this viewer may do, as the hero ⋮ they replace did. A new array
   * every render is fine; the registration changes only when an item's id, label, icon or
   * reason does, and each `run` always calls the latest callback.
   */
  extras?: readonly PageExtraAction[] | undefined;
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
  title,
  extras,
}: PageEditActionOptions): void {
  const runRef = useRef(run);
  const extrasRef = useRef(extras);
  useEffect(() => {
    runRef.current = run;
    extrasRef.current = extras;
  });

  // What the menu shows, without the callbacks: the registration's identity.
  const extrasKey = JSON.stringify(
    (extras ?? []).map(({ id, label, icon, disabledReason }) => [id, label, icon, disabledReason])
  );

  useEffect(() => {
    // JSON turns an absent reason into null.
    const items = JSON.parse(extrasKey) as [string, string, PageExtraItem['icon'], string | null][];
    if (!enabled && items.length === 0) return;
    const owner = Symbol(kind);
    usePageEditTargetStore.getState().register(owner, {
      kind,
      canEdit: enabled,
      run: () => runRef.current(),
      addClassesHref,
      title,
      extras: items.map(([id, label, icon, disabledReason]) => ({
        id,
        label,
        icon,
        ...(disabledReason ? { disabledReason } : {}),
        run: () => extrasRef.current?.find(extra => extra.id === id)?.run(),
      })),
    });
    return () => usePageEditTargetStore.getState().clear(owner);
  }, [kind, enabled, addClassesHref, title, extrasKey]);
}

/**
 * Setup -> Classes tells the header Actions menu which trial is selected, so "Add classes"
 * opens the wizard on it (the toolbar button this replaced did). Cleared on leave.
 */
export function useSetupAddClassesTrial(trialId: string | null | undefined): void {
  useEffect(() => {
    usePageEditTargetStore.getState().setAddClassesTrialId(trialId ?? null);
    return () => usePageEditTargetStore.getState().setAddClassesTrialId(null);
  }, [trialId]);
}

export interface PageExportActionOptions {
  id: string;
  /** The list's own gate: the table was showing and had rows, as its old Export button required. */
  enabled: boolean;
  /** Downloads the list as CSV. May change identity every render; the latest one always runs. */
  run: () => void;
}

/**
 * Register a list's whole-list "Export CSV" for the header Actions menu and the command palette
 * while the list is mounted and `enabled`. It replaces the table's own Export button (owner
 * decision 4); selection export lives in the bulk bar.
 */
export function usePageExportAction({ id, enabled, run }: PageExportActionOptions): void {
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });

  useEffect(() => {
    if (!enabled) return;
    const key = Symbol(id);
    usePageEditTargetStore.getState().registerExport({ key, id, run: () => runRef.current() });
    return () => usePageEditTargetStore.getState().clearExport(key);
  }, [id, enabled]);
}
