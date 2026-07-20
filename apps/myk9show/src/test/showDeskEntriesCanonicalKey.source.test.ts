import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const showWorkbenchShowDeskSource = readFileSync(
  join(__dirname, '..', 'pages', 'secretary', 'ShowWorkbenchShowDeskPage.tsx'),
  'utf8'
);
const showDetailsSource = readFileSync(
  join(__dirname, '..', 'pages', 'ShowDetailsPage.tsx'),
  'utf8'
);

describe('Show Desk entries query key stays canonical', () => {
  it('ShowWorkbenchShowDeskPage reads entries through queryKeys.showEntries', () => {
    expect(showWorkbenchShowDeskSource).toContain('useSecretaryShowEntriesQuery(');
    expect(showWorkbenchShowDeskSource).not.toContain('getEntriesForShow(');
    expect(showWorkbenchShowDeskSource).not.toContain("'secretary-show-entries'");
  });

  it('ShowDetailsPage reads entries through the shared secretary hook', () => {
    expect(showDetailsSource).toContain('useSecretaryShowEntriesQuery(');
    expect(showDetailsSource).not.toContain('getEntriesForShow(');
    expect(showDetailsSource).not.toContain("'secretary-show-entries'");
  });
});
