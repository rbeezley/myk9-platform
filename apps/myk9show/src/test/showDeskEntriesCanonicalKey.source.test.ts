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
    expect(showWorkbenchShowDeskSource).toContain('queryKeys.showEntries(');
    expect(showWorkbenchShowDeskSource).not.toContain("'secretary-show-entries'");
  });

  it('ShowDetailsPage reads entries through queryKeys.showEntries', () => {
    expect(showDetailsSource).toContain('queryKeys.showEntries(');
    expect(showDetailsSource).not.toContain("'secretary-show-entries'");
  });
});
