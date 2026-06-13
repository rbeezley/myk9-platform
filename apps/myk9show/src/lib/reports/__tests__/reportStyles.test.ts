import { describe, it, expect } from 'vitest';
import { REPORT_STYLES } from '../reportStyles';

// Regression: the scoresheet entry-row internals and the result-label grid
// shipped as markup whose CSS classes were never authored — in neither myK9Q
// nor myK9Show. The renderer inlines ONLY REPORT_STYLES (no Tailwind, no
// per-template styles), so the scoring boxes, hand-fill lines, and labels
// rendered unstyled/invisible in the preview. Guard that every class those two
// templates emit has a matching rule here, so a future markup edit that adds a
// class without CSS fails in CI instead of silently shipping unstyled.

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

// Emitted by ResultLabels.tsx.
const RESULT_LABEL_CLASSES = [
  'result-labels-grid',
  'result-label',
  'result-label-armband',
  'result-label-callname',
  'result-label-handler',
  'result-label-show',
  'result-label-trial-class',
  'result-label-results',
];

/** True when the stylesheet has a selector for exactly `.cls` (followed by a
 *  selector boundary), so `.result-label` is not satisfied by `.result-label-show`. */
function defines(cls: string): boolean {
  return new RegExp(`\\.${cls}[\\s,{:.]`).test(REPORT_STYLES);
}

describe('REPORT_STYLES defines every class the scoresheet + result-label templates emit', () => {
  it.each(SCORESHEET_CLASSES)('defines .%s (scoresheet)', cls => {
    expect(defines(cls)).toBe(true);
  });

  it.each(RESULT_LABEL_CLASSES)('defines .%s (result labels)', cls => {
    expect(defines(cls)).toBe(true);
  });

  it('renders the hand-fill scoring line as a visible underline, not an empty span', () => {
    // .field-line was an empty <span> with no CSS — invisible. It must carry a
    // border so a judge has a line to write on.
    expect(REPORT_STYLES).toMatch(/\.field-line\s*\{[^}]*border-bottom/);
  });
});
