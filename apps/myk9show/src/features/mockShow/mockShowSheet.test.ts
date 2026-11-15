import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MOCK_SHOW_CLOSING_QUESTIONS,
  MOCK_SHOW_NOTE_PROMPTS,
  MOCK_SHOW_RULES,
  MOCK_SHOW_TASKS,
} from './mockShowSheet';

const sheet = readFileSync(
  resolve(process.cwd(), '../../docs/operations/mock-show-test-sheet.md'),
  'utf8'
);

function section(heading: string): string {
  const start = sheet.indexOf(`## ${heading}`);
  expect(start, `sheet has "## ${heading}"`).toBeGreaterThanOrEqual(0);
  const next = sheet.indexOf('\n## ', start + 3);
  return sheet.slice(start, next === -1 ? undefined : next);
}

const plain = (text: string) => text.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

describe('mock show sheet constants match docs/operations/mock-show-test-sheet.md', () => {
  it('lists the same tasks, in order, with the same words', () => {
    const rows = section('The tasks')
      .split('\n')
      .filter(line => /^\|\s*\|\s*\*\*\d+\./.test(line))
      .map(line => line.split('|')[2] ?? '');

    expect(rows).toHaveLength(MOCK_SHOW_TASKS.length);
    rows.forEach((cell, index) => {
      const task = MOCK_SHOW_TASKS[index]!;
      const match = /^\s*\*\*(\d+)\.\s+(.+?)\*\*\s*(.*?)\s*$/.exec(cell);
      expect(match, `row ${index + 1} parses`).not.toBeNull();
      expect(task.number).toBe(Number(match![1]));
      expect(task.name).toBe(match![2]!.replace(/\.$/, ''));
      expect(task.detail).toBe(plain(match![3]!));
    });
  });

  it('has the same two rules', () => {
    const rules = section('Before you start')
      .split('\n')
      .filter(line => line.startsWith('- '))
      .map(line => plain(line.slice(2)));
    expect([...MOCK_SHOW_RULES]).toEqual(rules);
  });

  it('has the same three closing questions', () => {
    const questions = section('Three questions at the end')
      .split('\n')
      .filter(line => /^\d+\.\s/.test(line))
      .map(line => plain(line.replace(/^\d+\.\s+/, '')));
    expect([...MOCK_SHOW_CLOSING_QUESTIONS]).toEqual(questions);
  });

  it('has the same note prompts', () => {
    const prompts = section('For each task, write down')
      .split('\n')
      .filter(line => line.startsWith('- '))
      .map(line => plain(line.slice(2)));
    expect([...MOCK_SHOW_NOTE_PROMPTS]).toEqual(prompts);
  });

  it('uses no em dashes', () => {
    const all = JSON.stringify([
      MOCK_SHOW_RULES,
      MOCK_SHOW_TASKS,
      MOCK_SHOW_CLOSING_QUESTIONS,
      MOCK_SHOW_NOTE_PROMPTS,
    ]);
    expect(all).not.toContain('—');
  });
});
