import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render } from '@/test/utils/testUtils';
import {
  CLASS_STATUS_VALUES,
  ENTRY_STATUS_VALUES,
  TRIAL_STATUS_VALUES,
  getStatusDescriptor,
  getStatusSurfaceClasses,
  type StatusFamily,
} from './statusIconGrammar';
import {
  contrastRatio,
  composite,
  resolveColorValue,
} from '@/styles/__tests__/contrast-test-utils';
import { StatusBadge } from './StatusBadge';

const AA_NORMAL = 4.5;
const appRoot = process.cwd();

function read(relPath: string): string {
  return readFileSync(join(appRoot, relPath), 'utf8');
}

describe('rendered status badge contrast', () => {
  const indexCss = read('src/index.css');
  const paletteCss = read('src/pages/scoring/styles/design-tokens.css');
  const darkCss = indexCss.slice(indexCss.indexOf('.dark {'));
  const statuses: readonly [StatusFamily, readonly string[]][] = [
    ['entry', ENTRY_STATUS_VALUES],
    ['class', CLASS_STATUS_VALUES],
    ['trial', TRIAL_STATUS_VALUES],
  ];

  it('renders every status with its semantic composited surface', () => {
    const { container } = render(
      <>
        {statuses.flatMap(([family, values]) =>
          values.map(status => (
            <StatusBadge
              key={`${family}-${status}`}
              family={family}
              status={status}
              className={getStatusSurfaceClasses(family, status)}
            />
          ))
        )}
      </>
    );
    const badges = [...container.querySelectorAll<HTMLElement>('div.inline-flex')];

    expect(badges).toHaveLength(
      ENTRY_STATUS_VALUES.length + CLASS_STATUS_VALUES.length + TRIAL_STATUS_VALUES.length
    );
    statuses.forEach(([family, values], familyIndex) => {
      values.forEach((status, statusIndex) => {
        const badge =
          badges[
            statuses
              .slice(0, familyIndex)
              .reduce((count, [, priorValues]) => count + priorValues.length, 0) + statusIndex
          ];
        expect(badge).toHaveClass(...getStatusSurfaceClasses(family, status).split(' '));
      });
    });
  });

  it.each([
    ['light', indexCss],
    ['dark', darkCss],
  ] as const)(
    'measures the full semantic palette at AA on rendered 10%% surfaces in %s',
    (theme, css) => {
      const background = resolveColorValue('--background', css, indexCss, paletteCss);
      const card = resolveColorValue('--card', css, indexCss, paletteCss);
      const failures: string[] = [];

      for (const [family, values] of statuses) {
        for (const status of values) {
          const colorClass = getStatusDescriptor(family, status).colorClass;
          const token = colorClass.replace('text-', '--');
          const foreground = resolveColorValue(token, css, indexCss, paletteCss);
          const isMuted = colorClass === 'text-muted-foreground';
          const fill = isMuted
            ? resolveColorValue('--muted', css, indexCss, paletteCss)
            : resolveColorValue(token.replace('-foreground', ''), css, indexCss, paletteCss);
          for (const [surfaceName, surface] of [
            ['background', background],
            ['card', card],
          ] as const) {
            const renderedSurface = isMuted ? fill : composite(fill, 0.1, surface);
            const ratio = contrastRatio(foreground, renderedSurface);
            if (ratio < AA_NORMAL) failures.push(`${family}/${status} on ${surfaceName}: ${ratio}`);
          }
        }
      }

      expect(failures, `${theme} rendered palette failures`).toEqual([]);
    }
  );

  it('pins both page-local implementations against contrast regressions', () => {
    const showMapSource = read('src/features/show-map/ShowMapStatusBadge.tsx');
    const adminHelpSource = read('src/features/admin-help/components/UndocumentedRoutesPanel.tsx');

    expect(showMapSource).toContain('getStatusSurfaceClasses');
    expect(showMapSource).not.toContain('variant="secondary"');
    expect(adminHelpSource).toContain('bg-warning/10 p-3 text-warning');
    expect(adminHelpSource).not.toContain('bg-amber-50');
  });
});
