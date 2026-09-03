import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../../../../..');

const requiredLabels: Array<{ file: string; labels: string[] }> = [
  {
    file: 'apps/myk9show/src/components/common/RecentSearches.tsx',
    labels: ['Remove recent search ${search.query}'],
  },
  {
    file: 'apps/myk9show/src/components/common/UnifiedSidebar.tsx',
    labels: ['Close sidebar', 'Clear ${title} search'],
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
