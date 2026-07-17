import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../../../../..');

const requiredLabels: Array<{ file: string; labels: string[] }> = [
  {
    file: 'apps/myk9show/src/components/common/AdvancedSearch.tsx',
    labels: [
      'aria-label={isSearching ?',
      'Close advanced filters',
      'Remove ${status} status filter',
    ],
  },
  {
    file: 'apps/myk9show/src/components/common/RecentSearches.tsx',
    labels: ['Remove recent search ${search.query}'],
  },
  {
    file: 'apps/myk9show/src/components/common/search/PaginatedSearchResults.tsx',
    labels: ['Remove ${filter?.name ?? filterId} filter', 'Previous page', 'Next page'],
  },
  {
    file: 'apps/myk9show/src/components/common/UnifiedSidebar.tsx',
    labels: ['Close sidebar', 'Clear ${title} search'],
  },
  {
    file: 'apps/myk9show/src/components/common/PaginationPerformanceMonitor.tsx',
    labels: ['Hide pagination performance monitor', 'Show pagination performance monitor'],
  },
  {
    file: 'apps/myk9show/src/components/common/SearchPerformanceMonitor.tsx',
    labels: ['Refresh search performance stats', 'Hide search performance monitor'],
  },
  {
    file: 'apps/myk9show/src/components/common/virtual/VirtualScrollList.tsx',
    labels: ['Back to top'],
  },
  {
    file: 'apps/myk9show/src/components/layout/sidebar/RoleSidebar.tsx',
    labels: ['Close sidebar'],
  },
  {
    file: 'apps/myk9show/src/components/shows/RegistrationWorkflow/DogSearchInterface.tsx',
    labels: ['Clear dog search'],
  },
  {
    file: 'apps/myk9show/src/components/shows/RegistrationWorkflow/DraftManager.tsx',
    labels: ['Delete draft ${draft.title}'],
  },
  {
    file: 'apps/myk9show/src/components/shows/RegistrationWorkflow/InfiniteDogSelectionStep.tsx',
    labels: ['Show dogs in grid view', 'Show dogs in list view', 'Back to top'],
  },
];

describe('icon-only button label source guards', () => {
  it('keeps swept shell/workflow icon-only controls action-named', () => {
    for (const { file, labels } of requiredLabels) {
      const source = fs.readFileSync(path.join(repoRoot, file), 'utf8');
      for (const label of labels) {
        expect(source, file).toContain(label);
      }
    }
  });
});
