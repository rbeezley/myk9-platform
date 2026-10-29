import React from 'react';
import type { SetupPage, SetupSheet } from '@/features/registries';
import { SETUP_SHEET_STYLES } from './setupSheetStyles';

/**
 * Printable judge setup cheat sheet (MYK9-1078). One component renders any registry's
 * `SetupSheet`; the registry only changes the accent color and the data. Static: it needs
 * no show data, so it works offline and from the at-show judge view as well as Reports.
 */
const ACCENTS: Record<SetupSheet['registryId'], { accent: string; light: string }> = {
  UKC: { accent: '#1e3a8a', light: '#dbe4f7' },
  AKC: { accent: '#166534', light: '#d6efdc' },
};

function SheetPage({ sheet, page }: { sheet: SetupSheet; page: SetupPage }) {
  return (
    <section className="setup-page" aria-label={page.title} data-setup-page={page.id}>
      <header className="setup-header">
        <h1 className="setup-title">{sheet.title}</h1>
        <h2 className="setup-page-title">{page.title}</h2>
      </header>
      <table
        className="setup-table"
        data-testid={`setup-table-${page.id}`}
        style={
          page.tableFontPt
            ? ({ '--setup-table-pt': `${page.tableFontPt}pt` } as React.CSSProperties)
            : undefined
        }
      >
        <thead>
          <tr>
            <th scope="col" className="setup-label-col">
              Setup item
            </th>
            {page.columns.map(column => (
              <th key={column.key} scope="col">
                {column.label}
                {column.note && <span className="setup-level-note">{column.note}</span>}
              </th>
            ))}
          </tr>
        </thead>
        {page.groups.map(group => (
          <tbody key={group.elementKey} data-element={group.elementKey}>
            <tr className="setup-group-row">
              <th scope="colgroup" colSpan={page.columns.length + 1}>
                {group.title}
              </th>
            </tr>
            {group.rows.map(row => (
              <tr key={row.id} data-row={row.id}>
                <th scope="row">{row.label}</th>
                {page.columns.map(column => (
                  <td key={column.key}>{row.values[column.key] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
      <ul className="setup-notes">
        {page.notes.map(note => (
          <li key={note.heading}>
            <strong>{note.heading}.</strong> {note.text}
          </li>
        ))}
      </ul>
      <footer className="setup-footer">{sheet.edition}</footer>
    </section>
  );
}

export const SetupCheatSheet: React.FC<{ sheet: SetupSheet }> = ({ sheet }) => {
  const { accent, light } = ACCENTS[sheet.registryId];
  return (
    <div
      className="setup-sheet"
      data-registry={sheet.registryId}
      style={
        {
          '--setup-accent': accent,
          '--setup-accent-light': light,
          '--setup-table-pt': `${sheet.tableFontPt}pt`,
        } as React.CSSProperties
      }
    >
      <style>{SETUP_SHEET_STYLES}</style>
      {sheet.pages.map(page => (
        <SheetPage key={page.id} sheet={sheet} page={page} />
      ))}
    </div>
  );
};
