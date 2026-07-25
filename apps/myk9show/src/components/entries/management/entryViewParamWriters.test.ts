import { describe, expect, it } from 'vitest';
import { OPERATIONAL_VIEW_SERIALIZATION_VERSION } from '@/features/operational-views/operationalViews';
import { PaymentStatus } from '@/types/show-registration-types';
import { writeView } from './entryViewParamWriters';

describe('writeView', () => {
  it('replaces the current trial and class with the restored view scope', () => {
    const result = writeView(
      new URLSearchParams('trial=old-trial&class=old-class&attention=pending'),
      {
        surface: 'entry-management',
        version: OPERATIONAL_VIEW_SERIALIZATION_VERSION,
        filters: {
          attention: 'accepted',
          payment: PaymentStatus.PENDING,
          mode: 'review',
          view: 'table',
        },
        scope: {
          showId: 'show-1',
          trialId: 'trial-1',
          classId: 'class-1',
        },
      }
    );

    expect(result.get('trial')).toBe('trial-1');
    expect(result.get('class')).toBe('class-1');
  });
});
