import { describe, expect, it } from 'vitest';
import { PaymentService } from './PaymentService';

describe('PaymentService.calculateEntryFee', () => {
  const service = PaymentService.getInstance();

  it('returns the base fee with no adjustments for a single, non-member entry', async () => {
    const result = await service.calculateEntryFee('show-1', 'Novice A', false, 1);

    expect(result).toEqual({
      baseFee: 35.0,
      adjustments: [],
      totalFee: 35.0,
    });
  });

  it('applies a $5 member discount', async () => {
    const result = await service.calculateEntryFee('show-1', 'Novice A', true, 1);

    expect(result.adjustments).toEqual([
      { type: 'discount', amount: -5, description: 'Member Discount' },
    ]);
    expect(result.totalFee).toBe(30);
  });

  it('applies a $3-per-additional-entry discount for multiple entries', async () => {
    const result = await service.calculateEntryFee('show-1', 'Novice A', false, 3);

    expect(result.adjustments).toEqual([
      {
        type: 'discount',
        amount: -6,
        description: 'Multiple Entry Discount (2 additional entries)',
      },
    ]);
    expect(result.totalFee).toBe(29);
  });

  it('stacks the member discount and the multiple-entry discount', async () => {
    const result = await service.calculateEntryFee('show-1', 'Novice A', true, 3);

    expect(result.adjustments).toHaveLength(2);
    expect(result.totalFee).toBe(24);
  });

  it('never returns a total fee below the $5 minimum, even with large discounts', async () => {
    const result = await service.calculateEntryFee('show-1', 'Novice A', true, 20);

    expect(result.totalFee).toBe(5);
  });

  it('treats multipleEntryCount of 0 the same as 1 (no multiple-entry discount)', async () => {
    const result = await service.calculateEntryFee('show-1', 'Novice A', false, 0);

    expect(result.adjustments).toEqual([]);
    expect(result.totalFee).toBe(35);
  });
});
