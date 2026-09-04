import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import {
  localMatchDraftV1Schema,
  type LocalMatchDraftV1,
} from './local-match-draft';
import {
  DraftPersistenceError,
  type DraftLoadResult,
  type ScoringDraftRepository,
} from './scoring-draft-repository';

const DATABASE_NAME = 'teamizer-local.db';

type ScoringDatabase = Pick<
  SQLiteDatabase,
  'execAsync' | 'getFirstAsync' | 'runAsync'
>;

type DraftRow = {
  draftJson: string;
};

export class SqliteScoringDraftRepository implements ScoringDraftRepository {
  private databasePromise: Promise<ScoringDatabase> | null = null;

  constructor(
    private readonly openDatabase: () => Promise<ScoringDatabase> = () =>
      openDatabaseAsync(DATABASE_NAME),
  ) {}

  async load(userId: string, matchId: string): Promise<DraftLoadResult> {
    try {
      const database = await this.database();
      const row = await database.getFirstAsync<DraftRow>(
        `SELECT draft_json AS draftJson
           FROM local_match_drafts
          WHERE user_id = ? AND match_id = ?`,
        userId,
        matchId,
      );

      if (!row) {
        return { status: 'NOT_FOUND' };
      }

      let parsedJson: unknown;

      try {
        parsedJson = JSON.parse(row.draftJson);
      } catch {
        return {
          status: 'CORRUPT',
          message: 'The saved score draft is not valid JSON.',
        };
      }

      const parsedDraft = localMatchDraftV1Schema.safeParse(parsedJson);

      if (!parsedDraft.success) {
        return {
          status: 'CORRUPT',
          message: 'The saved score draft has invalid or unsupported data.',
        };
      }

      if (
        parsedDraft.data.userId !== userId ||
        parsedDraft.data.matchId !== matchId
      ) {
        return {
          status: 'CORRUPT',
          message: 'The saved score draft belongs to another account or Match.',
        };
      }

      return { status: 'FOUND', draft: parsedDraft.data };
    } catch (error) {
      if (error instanceof DraftPersistenceError) {
        throw error;
      }

      throw new DraftPersistenceError('The local score could not be read.', {
        cause: error,
      });
    }
  }

  async save(draft: LocalMatchDraftV1): Promise<void> {
    const validatedDraft = localMatchDraftV1Schema.parse(draft);

    try {
      const database = await this.database();
      await database.runAsync(
        `INSERT INTO local_match_drafts (
           user_id, match_id, schema_version, draft_json, updated_at
         ) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id, match_id) DO UPDATE SET
           schema_version = excluded.schema_version,
           draft_json = excluded.draft_json,
           updated_at = excluded.updated_at`,
        validatedDraft.userId,
        validatedDraft.matchId,
        validatedDraft.schemaVersion,
        JSON.stringify(validatedDraft),
        validatedDraft.updatedAt,
      );
    } catch (error) {
      throw new DraftPersistenceError('The local score could not be saved.', {
        cause: error,
      });
    }
  }

  async delete(userId: string, matchId: string): Promise<void> {
    try {
      const database = await this.database();
      await database.runAsync(
        `DELETE FROM local_match_drafts
          WHERE user_id = ? AND match_id = ?`,
        userId,
        matchId,
      );
    } catch (error) {
      throw new DraftPersistenceError(
        'The saved local score could not be removed.',
        { cause: error },
      );
    }
  }

  private database(): Promise<ScoringDatabase> {
    this.databasePromise ??= this.openAndMigrate();
    return this.databasePromise;
  }

  private async openAndMigrate(): Promise<ScoringDatabase> {
    try {
      const database = await this.openDatabase();
      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS local_match_drafts (
          user_id TEXT NOT NULL,
          match_id TEXT NOT NULL,
          schema_version INTEGER NOT NULL,
          draft_json TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (user_id, match_id)
        );
      `);
      return database;
    } catch (error) {
      this.databasePromise = null;
      throw new DraftPersistenceError(
        'Local score storage could not be initialized.',
        { cause: error },
      );
    }
  }
}
