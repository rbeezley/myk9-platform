/**
 * Judge setup cheat sheet data (MYK9-1078).
 *
 * One typed shape for every registry's printed setup card, so a single report
 * component renders UKC, AKC and (later) ASCA, UKC Handler Discrimination or the AKC
 * Detective class without a new layout. A sheet is a list of printed pages; a page is
 * one table whose columns are levels and whose row groups are elements. Values are the
 * short strings printed in the cells, keyed by level, so a test can read any single
 * element / row / level without parsing a layout.
 *
 * Element keys and level keys come from `elementLevels.ts` / the registry configs
 * (UKC: container, interior, exterior, vehicle, hd; AKC: container, interior, exterior,
 * buried, hd). Every value must trace to a rulebook line; the data modules cite the
 * chapter and section next to each element.
 */

import type { RegistryId } from './types';

/** One level column. `note` prints under the level name (UKC puts the max time here). */
export interface SetupLevelColumn {
  /** Level key from the registry config (e.g. 'novice'). */
  key: string;
  /** Printed level name. */
  label: string;
  /** Optional second header line, e.g. "Max time 3 min". */
  note?: string;
}

/** One printed row: a label and one short value per level key. */
export interface SetupRow {
  /** Stable id used by tests and by callers that need one cell (e.g. 'hides', 'max-height'). */
  id: string;
  label: string;
  values: Readonly<Record<string, string>>;
}

/** A block of rows for one element (UKC Vehicles, AKC Buried, ...). */
export interface SetupElementGroup {
  /** Element key from the registry config. */
  elementKey: string;
  title: string;
  rows: readonly SetupRow[];
}

/** One printed page, one table. */
export interface SetupPage {
  id: string;
  /** Page heading, e.g. "Side 1: Vehicles and Containers". */
  title: string;
  columns: readonly SetupLevelColumn[];
  /** Overrides the sheet's table size for a sparse page (the single-sided AKC HD card). */
  tableFontPt?: number;
  groups: readonly SetupElementGroup[];
  /** Footer notes printed under the table: short verbatim rulebook excerpts under a heading. */
  notes: readonly SetupNote[];
}

/**
 * One verbatim rulebook excerpt. `quote` is copied word for word from the registry's rulebook
 * (trimmed to the shortest complete clause); `cite` is the chapter and section that holds it.
 * A guard test checks every quote against the rulebook text, so a note cannot paraphrase.
 */
export interface SetupExcerpt {
  quote: string;
  /** e.g. "Ch. 5 §9". */
  cite: string;
}

export interface SetupNote {
  /** Bold lead-in, e.g. "Vehicles". */
  heading: string;
  excerpts: readonly SetupExcerpt[];
}

export interface SetupSheet {
  registryId: Extract<RegistryId, 'UKC' | 'AKC'>;
  /** Card title, e.g. "UKC Nosework Judge Setup Cheat Sheet". */
  title: string;
  /** Rulebook edition line printed in each page footer. */
  edition: string;
  /**
   * Table text size in points. Never below 10; sized so the densest page of the sheet still
   * fits one Letter landscape sheet, so a sheet with less text prints larger.
   */
  tableFontPt: number;
  pages: readonly SetupPage[];
}

/** Look up one printed cell, or undefined when the element, row or level is not on the sheet. */
export function getSetupValue(
  sheet: SetupSheet,
  elementKey: string,
  rowId: string,
  levelKey: string
): string | undefined {
  for (const page of sheet.pages) {
    const group = page.groups.find(g => g.elementKey === elementKey);
    const row = group?.rows.find(r => r.id === rowId);
    if (row) return row.values[levelKey];
  }
  return undefined;
}
