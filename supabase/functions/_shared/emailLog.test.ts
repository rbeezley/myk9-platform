import { describe, expect, it, vi } from 'vitest';

import { HttpError } from './http/responses.ts';
import { requireEmailLogWrite } from './emailLog.ts';

describe('requireEmailLogWrite', () => {
  it('accepts a successful write', () => {
    expect(() => requireEmailLogWrite(null, 'test sender')).not.toThrow();
  });

  it('fails loudly without logging provider or recipient details', () => {
    const error = { code: '42501', message: 'contains sensitive context' };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => requireEmailLogWrite(error, 'test sender')).toThrowError(HttpError);
    expect(consoleError).toHaveBeenCalledWith(
      'test sender: failed to record email delivery history',
      { code: '42501' }
    );
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain(error.message);

    consoleError.mockRestore();
  });
});
