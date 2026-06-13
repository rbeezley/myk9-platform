import { describe, it, expect } from 'vitest';
import { REPORT_STYLES } from '../reportStyles';

// Regression: the scoresheet entry-row internals shipped as markup whose CSS
// classes were never authored — in neither myK9Q nor myK9Show. The renderer
// inlines ONLY REPORT_STYLES (no Tailwind, no per-template styles), so the
// scoring boxes and hand-fill lines rendered unstyled/invisible in the preview.
// Guard that every class the scoresheet template emits has a matching rule here,
// so a future markup edit that adds a class without CSS fails in CI instead of
// silently shipping unstyled. (Result Labels render via the dedicated label
// engine — buildLabelStylesheet — not REPORT_STYLES, so they are not guarded here.)

// Emitted by ScoresheetReport.tsx (entry-row internals).
const SCORESHEET_CLASSES = [
  'entry-info',
  'entry-armband',
  'entry-details',
  'entry-callname',
  'entry-reg',
  'entry-breed',
  'entry-handler',
  'entry-results',
  'results-row',
  'result-item',
  'scoring-fields',
  'field-row',
  'field-label',
  'field-line',
  'entry-reasons',
  'reasons-group',
  'reasons-label',
  'reasons-list',
  'reason-item',
  'entry-time',
  'time-box',
  'time-box-sm',
  'time-label',
  'time-row',
  'time-row-total',
  'area-label',
];

/** True when the stylesheet has a selector for exactly `.cls` (followed by a
 *  selector boundary), so `.entry-time` is not satisfied by `.entry-time-foo`. */
function defines(cls: string): boolean {
  return new RegExp(`\\.${cls}[\\s,{:.]`).test(REPORT_STYLES);
}

describe('REPORT_STYLES defines every class the scoresheet template emits', () => {
  it.each(SCORESHEET_CLASSES)('defines .%s (scoresheet)', cls => {
    expect(defines(cls)).toBe(true);
  });

  it('renders the hand-fill scoring line as a visible underline, not an empty span', () => {
    // .field-line was an empty <span> with no CSS — invisible. It must carry a
    // border so a judge has a line to write on.
    expect(REPORT_STYLES).toMatch(/\.field-line\s*\{[^}]*border-bottom/);
  });
});
