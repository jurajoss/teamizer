import type { LocalMatchDraftV1 } from './local-match-draft';

export type DraftLoadResult =
  | { status: 'NOT_FOUND' }
  | { status: 'FOUND'; draft: LocalMatchDraftV1 }
  | { status: 'CORRUPT'; message: string };

export interface ScoringDraftRepository {
  load(userId: string, matchId: string): Promise<DraftLoadResult>;
  save(draft: LocalMatchDraftV1): Promise<void>;
  delete(userId: string, matchId: string): Promise<void>;
}

export class DraftPersistenceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DraftPersistenceError';
  }
}
