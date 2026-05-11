import { describe, expect, it } from 'vitest';
import { formatJudgeName } from './SimpleClassSelector.helpers';

describe('formatJudgeName', () => {
  it('removes the empty qualification suffix from judge names', () => {
    expect(formatJudgeName('Liz Beezley( - )')).toBe('Liz Beezley');
  });

  it('keeps normal judge names unchanged', () => {
    expect(formatJudgeName('Liz Beezley')).toBe('Liz Beezley');
  });
});
