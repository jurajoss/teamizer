import { ApiClientError } from '../api/authenticated-api-client';
import type { CompleteMatchInput, MatchDetail } from '../api/contracts';
import type { CompletionCrypto } from './completion-crypto';
import {
  canonicalCompletionPayload,
  completionRequest,
  createLocalMatchDraft,
  draftMatchesServer,
  finalTeamSnapshot,
  type LocalMatchDraftV1,
  updatePlayerGoal,
  withCompletionState,
} from './local-match-draft';
import type { ScoringDraftRepository } from './scoring-draft-repository';

export interface MatchCompletionGateway {
  complete(
    matchId: string,
    request: CompleteMatchInput,
    idempotencyKey: string,
  ): Promise<{ match: MatchDetail; idempotentReplay: boolean }>;
  refresh(matchId: string): Promise<MatchDetail>;
}

export function shouldInitializeScoringSession(
  playerStatus: 'ACTIVE' | 'INACTIVE',
  matchStatus: MatchDetail['status'],
): boolean {
  return (
    matchStatus === 'FINISHED' ||
    matchStatus === 'CANCELLED' ||
    (playerStatus === 'ACTIVE' && matchStatus === 'IN_PROGRESS')
  );
}

export type ScoringSessionNotice =
  | { code: 'COMPLETION_PENDING' }
  | { code: 'COMPLETION_UNCONFIRMED'; detail?: string };

export type ScoringCompletionOutcome = 'SAVED' | 'CONFLICTED';

export function scoringSessionIdentity(
  userId: string,
  match: MatchDetail,
): string {
  return `${userId}:${match.id}:${match.stateVersion}:${match.status}`;
}

export type ScoringSessionState =
  | { status: 'LOADING' }
  | {
      status: 'SCORING';
      match: MatchDetail;
      draft: LocalMatchDraftV1;
      notice: ScoringSessionNotice | null;
    }
  | {
      status: 'CORRUPT_DRAFT' | 'STALE_DRAFT';
      match: MatchDetail;
      message: string;
    }
  | {
      status: 'BLOCKED';
      match: MatchDetail;
      draft: LocalMatchDraftV1 | null;
      message: string;
    }
  | { status: 'UNAVAILABLE'; match: MatchDetail; message: string }
  | {
      status: 'FINISHED';
      match: MatchDetail;
      outcome: ScoringCompletionOutcome | null;
      cleanupWarning: string | null;
    };

type StateListener = (state: ScoringSessionState) => void;

export class ScoringSessionController {
  private state: ScoringSessionState = { status: 'LOADING' };
  private readonly listeners = new Set<StateListener>();
  private operationQueue: Promise<void> = Promise.resolve();
  private completionPromise: Promise<void> | null = null;
  private initializedSessionIdentity: string | null = null;
  private userId: string | null = null;
  private match: MatchDetail | null = null;

  constructor(
    private readonly repository: ScoringDraftRepository,
    private readonly gateway: MatchCompletionGateway,
    private readonly completionCrypto: CompletionCrypto,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  get currentState(): ScoringSessionState {
    return this.state;
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);

    return () => {
      this.listeners.delete(listener);
    };
  }

  initialize(userId: string, match: MatchDetail): Promise<void> {
    const sessionIdentity = scoringSessionIdentity(userId, match);
    if (sessionIdentity === this.initializedSessionIdentity) {
      return this.operationQueue;
    }
    this.initializedSessionIdentity = sessionIdentity;

    return this.enqueue(async () => {
      this.userId = userId;
      this.match = match;

      if (match.status === 'FINISHED') {
        const cleanupWarning = await this.tryDelete(userId, match.id);
        this.setState({
          status: 'FINISHED',
          match,
          outcome: null,
          cleanupWarning,
        });
        return;
      }

      if (match.status === 'CANCELLED') {
        const cleanupWarning = await this.tryDelete(userId, match.id);
        this.setState({
          status: 'UNAVAILABLE',
          match,
          message:
            cleanupWarning ?? 'This Match was cancelled and cannot be scored.',
        });
        return;
      }

      if (match.status !== 'IN_PROGRESS') {
        this.setState({
          status: 'UNAVAILABLE',
          match,
          message: 'Local scoring is available only after the Match starts.',
        });
        return;
      }

      try {
        finalTeamSnapshot(match);
        const stored = await this.repository.load(userId, match.id);

        if (stored.status === 'NOT_FOUND') {
          await this.createFreshDraft(userId, match);
          return;
        }

        if (stored.status === 'CORRUPT') {
          this.setState({
            status: 'CORRUPT_DRAFT',
            match,
            message: stored.message,
          });
          return;
        }

        if (!draftMatchesServer(stored.draft, userId, match)) {
          this.setState({
            status: 'STALE_DRAFT',
            match,
            message:
              'The saved score does not match this Match’s final teams or state.',
          });
          return;
        }

        if (
          stored.draft.completion.state === 'SUCCEEDED' ||
          stored.draft.completion.state === 'CONFLICTED'
        ) {
          this.setState({
            status: 'CORRUPT_DRAFT',
            match,
            message:
              'The saved score has a terminal completion state but the Match is still in progress.',
          });
          return;
        }

        this.setState({
          status: 'SCORING',
          match,
          draft: stored.draft,
          notice:
            stored.draft.completion.state === 'PENDING'
              ? { code: 'COMPLETION_PENDING' }
              : null,
        });
      } catch (error) {
        this.setState({
          status: 'BLOCKED',
          match,
          draft: null,
          message: this.persistenceMessage(error),
        });
      }
    });
  }

  increment(playerId: string): Promise<void> {
    return this.changeGoal(playerId, 1);
  }

  decrement(playerId: string): Promise<void> {
    return this.changeGoal(playerId, -1);
  }

  discardDraft(): Promise<void> {
    return this.enqueue(async () => {
      const context = this.requireContext();

      try {
        await this.repository.delete(context.userId, context.match.id);
        await this.createFreshDraft(context.userId, context.match);
      } catch (error) {
        this.setState({
          status: 'BLOCKED',
          match: context.match,
          draft: this.state.status === 'BLOCKED' ? this.state.draft : null,
          message: this.persistenceMessage(error),
        });
      }
    });
  }

  finish(): Promise<void> {
    if (this.completionPromise) {
      return this.completionPromise;
    }

    this.completionPromise = this.finishOnce().finally(() => {
      this.completionPromise = null;
    });
    return this.completionPromise;
  }

  private async changeGoal(playerId: string, delta: 1 | -1): Promise<void> {
    return this.enqueue(async () => {
      if (this.state.status !== 'SCORING') {
        return;
      }

      const currentState = this.state;

      if (currentState.draft.completion.state !== 'ACTIVE') {
        return;
      }

      let nextDraft: LocalMatchDraftV1;

      try {
        nextDraft = updatePlayerGoal(
          currentState.draft,
          playerId,
          delta,
          this.now(),
        );

        if (nextDraft === currentState.draft) {
          return;
        }

        await this.repository.save(nextDraft);
        this.setState({
          ...currentState,
          draft: nextDraft,
          notice: null,
        });
      } catch (error) {
        this.setState({
          status: 'BLOCKED',
          match: currentState.match,
          draft: currentState.draft,
          message: this.persistenceMessage(error),
        });
      }
    });
  }

  private async createFreshDraft(
    userId: string,
    match: MatchDetail,
  ): Promise<void> {
    const draft = createLocalMatchDraft(userId, match, this.now());
    await this.repository.save(draft);
    this.setState({
      status: 'SCORING',
      match,
      draft,
      notice: null,
    });
  }

  private async finishOnce(): Promise<void> {
    const pendingDraft = await this.prepareCompletion();

    if (!pendingDraft) {
      return;
    }

    const idempotencyKey = pendingDraft.completion.idempotencyKey;
    const storedHash = pendingDraft.completion.canonicalRequestHash;

    if (!idempotencyKey || !storedHash) {
      this.block(pendingDraft, 'The saved completion attempt is incomplete.');
      return;
    }

    const currentHash = await this.completionCrypto.hashCanonicalPayload(
      canonicalCompletionPayload(pendingDraft),
    );

    if (currentHash !== storedHash) {
      this.block(
        pendingDraft,
        'The saved completion payload no longer matches its retry fingerprint.',
      );
      return;
    }

    try {
      await this.gateway.complete(
        pendingDraft.matchId,
        completionRequest(pendingDraft),
        idempotencyKey,
      );
      await this.finishWithAuthoritativeResult(
        pendingDraft,
        'SAVED',
        'SUCCEEDED',
      );
    } catch (error) {
      await this.handleCompletionError(pendingDraft, error);
    }
  }

  private prepareCompletion(): Promise<LocalMatchDraftV1 | null> {
    let result: LocalMatchDraftV1 | null = null;

    return this.enqueue(async () => {
      if (this.state.status !== 'SCORING') {
        return;
      }

      const currentState = this.state;

      if (currentState.draft.completion.state === 'PENDING') {
        result = currentState.draft;
        return;
      }

      try {
        const key = this.completionCrypto.createIdempotencyKey();
        const hash = await this.completionCrypto.hashCanonicalPayload(
          canonicalCompletionPayload(currentState.draft),
        );
        const pending = withCompletionState(
          currentState.draft,
          {
            state: 'PENDING',
            idempotencyKey: key,
            canonicalRequestHash: hash,
          },
          this.now(),
        );
        await this.repository.save(pending);
        this.setState({
          ...currentState,
          draft: pending,
          notice: { code: 'COMPLETION_PENDING' },
        });
        result = pending;
      } catch (error) {
        this.setState({
          status: 'BLOCKED',
          match: currentState.match,
          draft: currentState.draft,
          message: this.persistenceMessage(error),
        });
      }
    }).then(() => result);
  }

  private async handleCompletionError(
    pendingDraft: LocalMatchDraftV1,
    error: unknown,
  ): Promise<void> {
    if (error instanceof ApiClientError && error.status === 422) {
      await this.returnToActiveAfterValidation(pendingDraft, error.message);
      return;
    }

    if (error instanceof ApiClientError && error.status === 409) {
      await this.finishWithAuthoritativeResult(
        pendingDraft,
        'CONFLICTED',
        'CONFLICTED',
      );
      return;
    }

    if (this.state.status === 'SCORING') {
      this.setState({
        ...this.state,
        notice: { code: 'COMPLETION_UNCONFIRMED' },
      });
    }
  }

  private async returnToActiveAfterValidation(
    pendingDraft: LocalMatchDraftV1,
    message: string,
  ): Promise<void> {
    const activeDraft = withCompletionState(
      pendingDraft,
      {
        state: 'ACTIVE',
        idempotencyKey: null,
        canonicalRequestHash: null,
      },
      this.now(),
    );

    try {
      await this.repository.save(activeDraft);
      const match = this.requireContext().match;
      this.setState({
        status: 'SCORING',
        match,
        draft: activeDraft,
        notice: { code: 'COMPLETION_UNCONFIRMED', detail: message },
      });
    } catch (error) {
      this.block(pendingDraft, this.persistenceMessage(error));
    }
  }

  private async finishWithAuthoritativeResult(
    pendingDraft: LocalMatchDraftV1,
    outcome: ScoringCompletionOutcome,
    terminalState: 'SUCCEEDED' | 'CONFLICTED',
  ): Promise<void> {
    let authoritative: MatchDetail;

    try {
      authoritative = await this.gateway.refresh(pendingDraft.matchId);
    } catch {
      if (this.state.status === 'SCORING') {
        this.setState({
          ...this.state,
          notice: { code: 'COMPLETION_UNCONFIRMED' },
        });
      }
      return;
    }

    if (authoritative.status !== 'FINISHED' || !authoritative.result) {
      this.block(
        pendingDraft,
        'The server did not confirm an authoritative finished result. The local draft was preserved.',
      );
      return;
    }

    this.match = authoritative;
    const terminalDraft = withCompletionState(
      pendingDraft,
      { ...pendingDraft.completion, state: terminalState },
      this.now(),
    );
    let cleanupWarning: string | null = null;

    try {
      await this.repository.save(terminalDraft);
      await this.repository.delete(pendingDraft.userId, pendingDraft.matchId);
    } catch (error) {
      cleanupWarning = this.persistenceMessage(error);
    }

    this.setState({
      status: 'FINISHED',
      match: authoritative,
      outcome,
      cleanupWarning,
    });
  }

  private block(draft: LocalMatchDraftV1, message: string): void {
    const match = this.requireContext().match;
    this.setState({ status: 'BLOCKED', match, draft, message });
  }

  private requireContext(): { userId: string; match: MatchDetail } {
    if (!this.userId || !this.match) {
      throw new Error('The scoring session has not been initialized.');
    }

    return { userId: this.userId, match: this.match };
  }

  private async tryDelete(
    userId: string,
    matchId: string,
  ): Promise<string | null> {
    try {
      await this.repository.delete(userId, matchId);
      return null;
    } catch (error) {
      return this.persistenceMessage(error);
    }
  }

  private persistenceMessage(error: unknown): string {
    return error instanceof Error
      ? `${error.message} Scoring is blocked to protect the result.`
      : 'Local score storage failed. Scoring is blocked to protect the result.';
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private setState(state: ScoringSessionState): void {
    this.state = state;

    for (const listener of this.listeners) {
      listener(state);
    }
  }
}
