import { describe, expect, it } from 'vitest';
import { cleanAskQAnswer } from './cleanAskQAnswer';

describe('cleanAskQAnswer', () => {
  it.each([
    ['## **Title**', 'Title'],
    ['# Heading\nbody', 'Heading\nbody'],
    ['###### Deep', 'Deep'],
    ['#\ntext', '\ntext'],
    ['---', ''],
    ['a\n***\nb', 'a\n\nb'],
    ['a\n___\nb', 'a\n\nb'],
    ['| a | b |\n|---|:---:|\n| 1 | 2 |', '| a | b |\n\n| 1 | 2 |'],
    ['**Withdraw**', 'Withdraw'],
    ['__Withdraw__ now', 'Withdraw now'],
    ['You can **With', 'You can With'],
    ['2 * $35 = $70', '2 * $35 = $70'],
    ['Fee $35* ... *Non-refundable', 'Fee $35* ... *Non-refundable'],
    ['fee_total', 'fee_total'],
    ['see [the guide](https://x.com/a_b__c) now', 'see [the guide](https://x.com/a_b__c) now'],
    ['1. Open My Shows\n2. Tap Leave class...', '1. Open My Shows\n2. Tap Leave class...'],
    ['- one\n- two', '- one\n- two'],
  ])('%j -> %j', (input, expected) => {
    expect(cleanAskQAnswer(input)).toBe(expected);
  });
});
