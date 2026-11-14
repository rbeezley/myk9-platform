// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { loadConfirmationNumbers } from './receiptNumbers';

function readerReturning(result: { data: unknown; error: unknown }) {
  const inMock = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ in: inMock });
  const from = vi.fn().mockReturnValue({ select });
  return { reader: { from } as never, from, select, inMock };
}

describe('loadConfirmationNumbers', () => {
  it('reads enrollments.confirmation_number for the distinct enrollment ids', async () => {
    const { reader, from, select, inMock } = readerReturning({
      data: [
        { id: 'enr-1', confirmation_number: 'CONF-1' },
        { id: 'enr-2', confirmation_number: null },
      ],
      error: null,
    });

    const numbers = await loadConfirmationNumbers(reader, ['enr-1', 'enr-1', 'enr-2', null]);

    expect(from).toHaveBeenCalledWith('enrollments');
    expect(select).toHaveBeenCalledWith('id, confirmation_number');
    expect(inMock).toHaveBeenCalledWith('id', ['enr-1', 'enr-2']);
    expect(numbers.get('enr-1')).toBe('CONF-1');
    expect(numbers.has('enr-2')).toBe(false);
  });

  it('does not query when no entry has an enrollment', async () => {
    const { reader, from } = readerReturning({ data: [], error: null });
    expect((await loadConfirmationNumbers(reader, [null, undefined])).size).toBe(0);
    expect(from).not.toHaveBeenCalled();
  });

  it('leaves the receipt line off when the lookup fails', async () => {
    const { reader } = readerReturning({ data: null, error: { message: 'boom' } });
    expect((await loadConfirmationNumbers(reader, ['enr-1'])).size).toBe(0);
  });
});
