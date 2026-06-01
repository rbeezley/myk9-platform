import { describe, expect, it } from 'vitest';
import {
  MESSAGE_SHOW_TEMPLATES,
  buildMessageShowDraft,
  buildMessageShowClassLabel,
  getMessageShowDeliveryLane,
  getMessageShowTemplate,
} from '../messageShow';

describe('messageShow', () => {
  it('keeps show-wide shortcuts available', () => {
    expect(MESSAGE_SHOW_TEMPLATES.map(template => template.id)).toEqual([
      'lunch-ready',
      'ring-paused',
      'results-posted',
      'report-to-gate',
      'class-delayed',
    ]);
  });

  it('builds a show-wide announcement draft', () => {
    expect(buildMessageShowDraft('lunch-ready')).toEqual({
      title: 'Lunch is ready',
      body: 'Lunch is ready for judges, stewards, and volunteers. Please check in at hospitality.',
    });
  });

  it('builds a class-specific draft with the class label', () => {
    expect(buildMessageShowDraft('report-to-gate', 'Container Novice A & B')).toEqual({
      title: 'Report to gate',
      body: 'Please report to the gate for Container Novice A & B. We are getting ready for your class.',
    });
  });

  it('maps recipients to the correct delivery lanes', () => {
    expect(getMessageShowDeliveryLane('all_show')).toBe('announcement');
    expect(getMessageShowDeliveryLane('class')).toBe('targeted');
    expect(getMessageShowDeliveryLane('checked_in')).toBe('targeted');
  });

  it('falls back to the default template for missing template ids', () => {
    expect(getMessageShowTemplate('missing-template')).toMatchObject({
      id: 'lunch-ready',
      label: 'Lunch ready',
    });
  });

  it('builds class labels without leaking UUID values', () => {
    expect(
      buildMessageShowClassLabel({
        name: '10e39f5f-ef3d-4673-b62c-116dd50ab071',
        className: 'Container Novice A & B',
        section: 'A & B',
      })
    ).toBe('Container Novice A & B');
  });
});
