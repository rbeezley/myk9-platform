import { describe, expect, it } from 'vitest';
import {
  buildClassBroadcastClassLabel,
  buildClassBroadcastMessage,
  getClassBroadcastTemplate,
} from '../classBroadcast';

describe('classBroadcast', () => {
  it('builds class-specific canned copy', () => {
    expect(buildClassBroadcastMessage('class-delayed', 'Container Novice A')).toBe(
      'Container Novice A is running later than posted. Please stay nearby and listen for updates.'
    );
  });

  it('falls back to the default template for unknown ids', () => {
    expect(getClassBroadcastTemplate('missing-template')).toMatchObject({
      id: 'report-to-gate',
      label: 'Report to gate',
    });
  });

  it('keeps copy speakable when the class label is blank', () => {
    expect(buildClassBroadcastMessage('report-to-gate', ' ')).toBe(
      'Please report to the gate for this class. We are getting ready for your class.'
    );
  });

  it('does not duplicate a class section already present in the name', () => {
    expect(buildClassBroadcastClassLabel({ name: 'Container Novice A', section: 'A' })).toBe(
      'Container Novice A'
    );
    expect(buildClassBroadcastClassLabel({ name: 'Container Novice', section: 'B' })).toBe(
      'Container Novice B'
    );
    expect(buildClassBroadcastClassLabel({ name: 'Container Novice AB', section: 'B' })).toBe(
      'Container Novice AB B'
    );
  });
});
