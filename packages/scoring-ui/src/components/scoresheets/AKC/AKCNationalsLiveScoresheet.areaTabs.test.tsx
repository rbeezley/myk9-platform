/**
 * MYK9-1835: each Nationals area gets its own time field. One field reused across the 5
 * areas kept the digits of the area before until an effect cleared them: in a browser that
 * is a frame in which a fast focus turned the stale "0:04.00" into "400", the next
 * keystrokes made "40000:04.00", which is not a time, and Save stayed off with no reason on
 * screen (the Nationals proof walk). jsdom flushes effects inside act, so the stale frame
 * cannot be observed here; what can be proven is that no field is shared between areas.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AKCNationalsLiveScoresheet } from './AKCNationalsLiveScoresheet';
import { buildResolvedClassRules } from '../../../utils/buildResolvedClassRules';

const rules = buildResolvedClassRules({ area_count: 5, time_limit_seconds: 120 });

function timeBox(area: number): HTMLInputElement {
  return screen.getByRole('textbox', { name: `Area ${area} time` });
}

it('gives every area its own time field, so none carries the time of the area before', () => {
  render(
    <AKCNationalsLiveScoresheet
      entry={{
        id: '1',
        armband: 700,
        dogName: 'Willow',
        handlerName: 'Casey',
        className: 'Container Novice A',
        element: 'Container',
        level: 'Novice',
      }}
      classInfo={{ element: 'Container', level: 'Novice' }}
      rules={rules}
      onSubmit={vi.fn()}
      onBack={vi.fn()}
    />
  );
  const fields = new Set<HTMLInputElement>();
  for (let area = 1; area <= 5; area++) {
    fireEvent.click(screen.getByTestId(`area-tab-${area}`));
    const box = timeBox(area);
    fields.add(box);
    expect(box.value).toBe('');
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: '00:04.00' } });
    fireEvent.blur(box);
    expect(box.value).toBe('0:04.00');
  }
  expect(fields.size).toBe(5);

  fireEvent.click(screen.getByTestId('result-Q'));
  expect(screen.getByTestId('submit-btn')).toBeEnabled();
});
