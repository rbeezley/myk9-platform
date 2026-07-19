import { describe, expect, it } from 'vitest';
import {
  MAKE_WHOLE_METADATA_KEY,
  refundKindFromMetadata,
} from './orderSnapshot';

describe('refundKindFromMetadata', () => {
  it('reads make_whole from the Stripe object so delivery order cannot mislabel it', () => {
    expect(refundKindFromMetadata({ metadata: { [MAKE_WHOLE_METADATA_KEY]: 'true' } })).toBe(
      'make_whole'
    );
  });

  it('defaults ordinary refunds to post_hoc', () => {
    expect(refundKindFromMetadata({ metadata: { type: 'entry_refund' } })).toBe('post_hoc');
    expect(refundKindFromMetadata({ metadata: null })).toBe('post_hoc');
    expect(refundKindFromMetadata({})).toBe('post_hoc');
  });

  it('does not treat a non-true marker as make_whole', () => {
    expect(refundKindFromMetadata({ metadata: { [MAKE_WHOLE_METADATA_KEY]: 'false' } })).toBe(
      'post_hoc'
    );
  });
});
