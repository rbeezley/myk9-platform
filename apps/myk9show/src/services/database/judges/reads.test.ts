import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state: {
    deleteResponse: { error: unknown };
    insertResponse: { error: unknown };
  } = {
    deleteResponse: { error: null },
    insertResponse: { error: null },
  };
  const isMock = vi.fn(async () => state.deleteResponse);
  const eqMock = vi.fn(() => ({ is: isMock }));
  const deleteMock = vi.fn(() => ({ eq: eqMock }));
  const insertMock = vi.fn(async () => state.insertResponse);
  const untypedFromMock = vi.fn(() => ({
    delete: deleteMock,
    insert: insertMock,
  }));
  return { state, isMock, eqMock, deleteMock, insertMock, untypedFromMock };
});

vi.mock('../queries/search-query-helpers', () => ({
  untypedFrom: mocks.untypedFromMock,
}));

vi.mock('../supabaseClient', () => ({
  supabase: {},
  logQuery: vi.fn(),
  createDatabaseError: (error: { message?: string }, table: string, operation: string) =>
    new Error(`${table}:${operation}:${error.message ?? 'unknown error'}`),
}));

import { persistShowJudgeAssignments } from './reads';

describe('persistShowJudgeAssignments', () => {
  beforeEach(() => {
    mocks.state.deleteResponse = { error: null };
    mocks.state.insertResponse = { error: null };
    vi.clearAllMocks();
  });

  it('throws when deleting existing show-level assignments fails', async () => {
    mocks.state.deleteResponse = { error: { message: 'RLS denied delete' } };

    await expect(
      persistShowJudgeAssignments('show-1', [{ judgeId: 'judge-1' }])
    ).rejects.toThrow('judge_assignments:delete_show_assignments:RLS denied delete');

    expect(mocks.insertMock).not.toHaveBeenCalled();
  });

  it('throws when inserting new show-level assignments fails', async () => {
    mocks.state.insertResponse = { error: { message: 'RLS denied insert' } };

    await expect(
      persistShowJudgeAssignments('show-1', [{ judgeId: 'judge-1' }], { skipDelete: true })
    ).rejects.toThrow('judge_assignments:insert_show_assignments:RLS denied insert');
  });
});
