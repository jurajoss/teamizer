import type { SQLiteDatabase } from 'expo-sqlite';
import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-sqlite', () => ({ openDatabaseAsync: vi.fn() }));

import { createLocalMatchDraft } from './local-match-draft';
import { ids, inProgressMatch } from './scoring-test-fixtures';
import { SqliteScoringDraftRepository } from './sqlite-scoring-draft-repository';

type ScoringDatabase = Pick<
  SQLiteDatabase,
  'execAsync' | 'getFirstAsync' | 'runAsync'
>;

function databaseWithRow(draftJson: string | null): {
  database: ScoringDatabase;
  execAsync: ReturnType<typeof vi.fn>;
  getFirstAsync: ReturnType<typeof vi.fn>;
  runAsync: ReturnType<typeof vi.fn>;
} {
  const execAsync = vi.fn().mockResolvedValue(undefined);
  const getFirstAsync = vi
    .fn()
    .mockResolvedValue(draftJson === null ? null : { draftJson });
  const runAsync = vi.fn().mockResolvedValue({
    lastInsertRowId: 0,
    changes: 1,
  });

  return {
    database: { execAsync, getFirstAsync, runAsync } as ScoringDatabase,
    execAsync,
    getFirstAsync,
    runAsync,
  };
}

describe('SqliteScoringDraftRepository', () => {
  it('creates a composite owner/Match table and atomically upserts one aggregate row', async () => {
    const fixture = databaseWithRow(null);
    const repository = new SqliteScoringDraftRepository(
      async () => fixture.database,
    );
    const draft = createLocalMatchDraft(
      ids.userA,
      inProgressMatch(),
      '2026-08-28T18:00:00.000Z',
    );

    await repository.save(draft);

    expect(fixture.execAsync.mock.calls[0]?.[0]).toContain(
      'PRIMARY KEY (user_id, match_id)',
    );
    expect(fixture.runAsync.mock.calls[0]?.[0]).toContain(
      'ON CONFLICT(user_id, match_id) DO UPDATE',
    );
    expect(fixture.runAsync.mock.calls[0]?.slice(1, 3)).toEqual([
      ids.userA,
      ids.match,
    ]);
  });

  it('loads only the requested authenticated owner and Match row', async () => {
    const draft = createLocalMatchDraft(
      ids.userA,
      inProgressMatch(),
      '2026-08-28T18:00:00.000Z',
    );
    const fixture = databaseWithRow(JSON.stringify(draft));
    const repository = new SqliteScoringDraftRepository(
      async () => fixture.database,
    );

    await expect(repository.load(ids.userA, ids.match)).resolves.toEqual({
      status: 'FOUND',
      draft,
    });
    expect(fixture.getFirstAsync.mock.calls[0]?.slice(1)).toEqual([
      ids.userA,
      ids.match,
    ]);
  });

  it('reports malformed persisted JSON as corrupt without replacing it', async () => {
    const fixture = databaseWithRow('{not valid json');
    const repository = new SqliteScoringDraftRepository(
      async () => fixture.database,
    );

    await expect(repository.load(ids.userA, ids.match)).resolves.toMatchObject({
      status: 'CORRUPT',
    });
    expect(fixture.runAsync).not.toHaveBeenCalled();
  });
});
