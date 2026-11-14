import { describe, expect, it } from 'vitest';

import { getCloseoutDuties, listRegistries } from '@/features/registries';

describe('getCloseoutDuties', () => {
  it('gives every registry a judge sign-off and a results submission', () => {
    for (const registryId of listRegistries()) {
      const kinds = getCloseoutDuties(registryId).map(duty => duty.kind);
      expect(kinds).toEqual(['judge-sign-off', 'results-submission']);
    }
  });

  it('shares no key between registries', () => {
    const keys = listRegistries().flatMap(id => getCloseoutDuties(id).map(duty => duty.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has the app record only the AKC results file, which it sends itself', () => {
    const appRecorded = listRegistries().flatMap(id =>
      getCloseoutDuties(id)
        .filter(duty => duty.recordedBy === 'app')
        .map(duty => duty.key)
    );
    expect(appRecorded).toEqual(['akc-results-file']);
  });
});
