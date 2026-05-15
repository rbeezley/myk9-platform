import { type JSX, type ReactNode } from 'react';
import { FIELD_GUIDE_BODY_FAMILY, FIELD_GUIDE_MONO_FAMILY } from '../fonts';
import { fieldGuideColors } from '../tokens';

export interface FieldGuideTableProps {
  /** `<thead>` content — typically a single `<tr>` of mono caps headers. */
  head?: ReactNode;
  /** `<tbody>` content — `<tr>` rows. Use `<FieldGuideTableRow alt>` to
   *  paint alternating-row backgrounds; the helper handles the chrome. */
  children: ReactNode;
  /** Optional aria-label for screen readers — e.g. "Trial particulars". */
  ariaLabel?: string;
}

export interface FieldGuideTableRowProps {
  /** When true, paint the row with the `paperWarm` alternating background. */
  alt?: boolean;
  children: ReactNode;
}

export interface FieldGuideTableLabelCellProps {
  /** Mono uppercase label, rendered as `<th scope="row">`. */
  children: ReactNode;
}

export interface FieldGuideTableValueCellProps {
  children: ReactNode;
  /** When true, render the cell with mono tabular-nums styling — used for
   *  the right-aligned numeric column in fee tables. */
  numeric?: boolean;
}

/**
 * FieldGuideTable — the workhorse data table. Hairline-bordered rows,
 * mono caps for `<th>`, optional alternating-row background via the
 * `alt` prop on the row helper.
 *
 * Why expose row + cell helpers instead of a `data` prop: many tables
 * have heterogeneous cells (one row holds chips, another a date, another
 * a number). A children API stays out of the way.
 */
export function FieldGuideTable({
  head,
  children,
  ariaLabel,
}: FieldGuideTableProps): JSX.Element {
  return (
    <table
      aria-label={ariaLabel}
      className="fg-table"
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontFamily: FIELD_GUIDE_BODY_FAMILY,
        fontSize: 14,
        borderTop: `2px solid ${fieldGuideColors.ink}`,
        borderBottom: `2px solid ${fieldGuideColors.ink}`,
      }}
    >
      {head && <thead>{head}</thead>}
      <tbody>{children}</tbody>
    </table>
  );
}

export function FieldGuideTableHeaderCell({ children }: { children: ReactNode }): JSX.Element {
  return (
    <th
      scope="col"
      style={{
        textAlign: 'left',
        fontFamily: FIELD_GUIDE_MONO_FAMILY,
        fontWeight: 600,
        fontSize: 10.5,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: fieldGuideColors.mute,
        padding: '8px 12px',
        background: fieldGuideColors.paperWarm,
        borderBottom: `1px solid ${fieldGuideColors.ink}`,
      }}
    >
      {children}
    </th>
  );
}

export function FieldGuideTableRow({ alt, children }: FieldGuideTableRowProps): JSX.Element {
  return (
    <tr
      data-alt={alt ? 'true' : undefined}
      className={alt ? 'fg-table-row fg-table-row--alt' : 'fg-table-row'}
      style={{
        background: alt ? fieldGuideColors.paperWarm : 'transparent',
        borderBottom: `1px solid ${fieldGuideColors.hair}`,
      }}
    >
      {children}
    </tr>
  );
}

export function FieldGuideTableLabelCell({
  children,
}: FieldGuideTableLabelCellProps): JSX.Element {
  return (
    <th
      scope="row"
      style={{
        textAlign: 'left',
        fontFamily: FIELD_GUIDE_MONO_FAMILY,
        fontWeight: 600,
        fontSize: 10.5,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: fieldGuideColors.mute,
        padding: '10px 12px',
        verticalAlign: 'top',
        width: 200,
      }}
    >
      {children}
    </th>
  );
}

export function FieldGuideTableValueCell({
  children,
  numeric = false,
}: FieldGuideTableValueCellProps): JSX.Element {
  return (
    <td
      style={{
        padding: '10px 12px',
        verticalAlign: 'top',
        color: fieldGuideColors.ink,
        ...(numeric
          ? {
              fontFamily: FIELD_GUIDE_MONO_FAMILY,
              fontWeight: 600,
              fontSize: 14,
              textAlign: 'right',
              fontVariantNumeric: 'tabular-nums',
            }
          : {}),
      }}
    >
      {children}
    </td>
  );
}
