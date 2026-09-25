import { describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '../api/authenticated-api-client';
import type { CompleteMatchInput, MatchDetail } from '../api/contracts';
import type { CompletionCrypto } from './completion-crypto';
import type { LocalMatchDraftV1 } from './local-match-draft';
import {
  ScoringSessionController,
  scoringSessionIdentity,
  shouldInitializeScoringSession,
  type MatchCompletionGateway,
} from './scoring-session-controller';
import type {
  DraftLoadResult,
  ScoringDraftRepository,
} from './scoring-draft-repository';
import { ids, finishedMatch, inProgressMatch } from './scoring-test-fixtures';

class MemoryDraftRepository implements ScoringDraftRepository {
  readonly rows = new Map<string, LocalMatchDraftV1>();
  readonly saves: LocalMatchDraftV1[] = [];
  readonly deletes: string[] = [];
  readonly loads: string[] = [];
  nextLoad: DraftLoadResult | null = null;
  failNextSave = false;
  beforeSave: (() => Promise<void>) | null = null;

  async load(userId: string, matchId: string): Promise<DraftLoadResult> {
    this.loads.push(this.key(userId, matchId));
    if (this.nextLoad) {
      const result = this.nextLoad;
      this.nextLoad = null;
      return result;
    }

    const draft = this.rows.get(this.key(userId, matchId));
    return draft
      ? { status: 'FOUND', draft: structuredClone(draft) }
      : { status: 'NOT_FOUND' };
  }

  async save(draft: LocalMatchDraftV1): Promise<void> {
    await this.beforeSave?.();

    if (this.failNextSave) {
      this.failNextSave = false;
      throw new Error('simulated SQLite write failure');
    }

    const saved = structuredClone(draft);
    this.rows.set(this.key(draft.userId, draft.matchId), saved);
    this.saves.push(saved);
  }

  async delete(userId: string, matchId: string): Promise<void> {
    const key = this.key(userId, matchId);
    this.rows.delete(key);
    this.deletes.push(key);
  }

  private key(userId: string, matchId: string): string {
    return `${userId}:${matchId}`;
  }
}

class FakeGateway implements MatchCompletionGateway {
  readonly calls: Array<{
    matchId: string;
    request: CompleteMatchInput;
    idempotencyKey: string;
  }> = [];
  completeImplementation: () => Promise<{
    match: MatchDetail;
    idempotentReplay: boolean;
  }> = async () => ({ match: finishedMatch(), idempotentReplay: false });
  refreshImplementation: () => Promise<MatchDetail> = async () =>
    finishedMatch();

  complete(
    matchId: string,
    request: CompleteMatchInput,
    idempotencyKey: string,
  ) {
    this.calls.push({ matchId, request, idempotencyKey });
    return this.completeImplementation();
  }

  refresh(): Promise<MatchDetail> {
    return this.refreshImplementation();
  }
}

function crypto(): CompletionCrypto & { payloads: string[] } {
  const payloads: string[] = [];
  return {
    payloads,
    createIdempotencyKey: () => 'stable-completion-key',
    hashCanonicalPayload: async (payload) => {
      payloads.push(payload);
      return 'a'.repeat(64);
    },
  };
}

function createController(
  repository = new MemoryDraftRepository(),
  gateway = new FakeGateway(),
  completionCrypto: CompletionCrypto = crypto(),
) {
  let tick = 0;
  const controller = new ScoringSessionController(
    repository,
    gateway,
    completionCrypto,
    () => `2026-08-28T18:00:${String(tick++).padStart(2, '0')}.000Z`,
  );
  return { controller, repository, gateway, completionCrypto };
}

async function start(controller: ScoringSessionController, userId = ids.userA) {
  await controller.initialize(userId, inProgressMatch());
  await controller.startScoring();
}

describe('ScoringSessionController', () => {
  it('initializes active scoring and terminal cleanup, but not OPEN or inactive scoring', () => {
    expect(shouldInitializeScoringSession('ACTIVE', 'IN_PROGRESS')).toBe(true);
    expect(shouldInitializeScoringSession('ACTIVE', 'FINISHED')).toBe(true);
    expect(shouldInitializeScoringSession('INACTIVE', 'CANCELLED')).toBe(true);
    expect(
      shouldInitializeScoringSession('ACTIVE', 'OPEN_FOR_REGISTRATION'),
    ).toBe(false);
    expect(shouldInitializeScoringSession('INACTIVE', 'IN_PROGRESS')).toBe(
      false,
    );
  });

  it('does not expose a new scoring draft until the first durable save commits', async () => {
    const { controller, repository } = createController();
    await controller.initialize(ids.userA, inProgressMatch());
    let releaseSave: (() => void) | undefined;
    repository.beforeSave = () =>
      new Promise<void>((resolve) => {
        releaseSave = resolve;
      });

    const starting = controller.startScoring();
    await Promise.resolve();

    expect(controller.currentState.status).toBe('READY_TO_START');
    releaseSave?.();
    await starting;
    expect(controller.currentState.status).toBe('SCORING');
  });

  it('checks one unchanged scoring session only once across rerenders', async () => {
    const { controller, repository } = createController();
    const match = inProgressMatch();

    expect(scoringSessionIdentity(ids.userA, match)).toBe(
      scoringSessionIdentity(ids.userA, structuredClone(match)),
    );
    await controller.initialize(ids.userA, match);
    await controller.initialize(ids.userA, structuredClone(match));
    await controller.initialize(ids.userA, structuredClone(match));

    expect(repository.loads).toEqual([`${ids.userA}:${ids.match}`]);
  });

  it('checks a changed or newly entered scoring session independently', async () => {
    const sharedRepository = new MemoryDraftRepository();
    const firstController = createController(sharedRepository).controller;

    await firstController.initialize(ids.userA, inProgressMatch());
    await firstController.initialize(
      ids.userA,
      inProgressMatch({ stateVersion: 2 }),
    );

    const newlyEnteredController =
      createController(sharedRepository).controller;
    await newlyEnteredController.initialize(
      ids.userA,
      inProgressMatch({ stateVersion: 2 }),
    );

    expect(sharedRepository.loads).toEqual([
      `${ids.userA}:${ids.match}`,
      `${ids.userA}:${ids.match}`,
      `${ids.userA}:${ids.match}`,
    ]);
  });

  it('serializes rapid taps so no committed increment is overwritten', async () => {
    const { controller, repository } = createController();
    await start(controller);

    await Promise.all([
      controller.increment(ids.playerA),
      controller.increment(ids.playerA),
      controller.increment(ids.playerA),
    ]);

    expect(controller.currentState).toMatchObject({
      status: 'SCORING',
      draft: {
        score: { teamA: 3, teamB: 0 },
        playerGoals: { [ids.playerA]: 3 },
      },
    });
    expect(
      repository.saves.slice(-3).map((draft) => draft.score.teamA),
    ).toEqual([1, 2, 3]);
  });

  it('keeps the last durable score visible and blocks after a write failure', async () => {
    const { controller, repository } = createController();
    await start(controller);
    repository.failNextSave = true;

    await controller.increment(ids.playerA);

    expect(controller.currentState).toMatchObject({
      status: 'BLOCKED',
      draft: { score: { teamA: 0, teamB: 0 } },
    });
    expect(repository.rows.get(`${ids.userA}:${ids.match}`)?.score.teamA).toBe(
      0,
    );
  });

  it('restores the exact durable score after a controller restart', async () => {
    const sharedRepository = new MemoryDraftRepository();
    const first = createController(sharedRepository).controller;
    await start(first);
    await first.increment(ids.playerC);
    await first.increment(ids.playerC);

    const restarted = createController(sharedRepository).controller;
    await restarted.initialize(ids.userA, inProgressMatch());

    expect(restarted.currentState).toMatchObject({
      status: 'SCORING',
      notice: { code: 'DRAFT_RESTORED' },
      draft: {
        score: { teamA: 0, teamB: 2 },
        playerGoals: { [ids.playerC]: 2 },
      },
    });
  });

  it('does not restore another authenticated user’s draft', async () => {
    const sharedRepository = new MemoryDraftRepository();
    const first = createController(sharedRepository).controller;
    await start(first, ids.userA);
    await first.increment(ids.playerA);

    const secondUser = createController(sharedRepository).controller;
    await secondUser.initialize(ids.userB, inProgressMatch());

    expect(secondUser.currentState.status).toBe('READY_TO_START');
  });

  it('blocks stale and corrupt drafts until explicit discard', async () => {
    const staleSetup = createController();
    await start(staleSetup.controller);
    const staleController = createController(staleSetup.repository).controller;
    await staleController.initialize(
      ids.userA,
      inProgressMatch({ stateVersion: 9 }),
    );
    expect(staleController.currentState.status).toBe('STALE_DRAFT');

    const corruptSetup = createController();
    corruptSetup.repository.nextLoad = {
      status: 'CORRUPT',
      message: 'bad row',
    };
    await corruptSetup.controller.initialize(ids.userA, inProgressMatch());
    expect(corruptSetup.controller.currentState.status).toBe('CORRUPT_DRAFT');
  });

  it('persists a key and fingerprint before sending a sparse completion body', async () => {
    const setup = createController();
    await start(setup.controller);
    await setup.controller.increment(ids.playerA);
    setup.gateway.completeImplementation = vi.fn(async () => {
      const persisted = setup.repository.rows.get(`${ids.userA}:${ids.match}`);
      expect(persisted?.completion).toEqual({
        state: 'PENDING',
        idempotencyKey: 'stable-completion-key',
        canonicalRequestHash: 'a'.repeat(64),
      });
      return { match: finishedMatch(), idempotentReplay: false };
    });

    await setup.controller.finish();

    expect(setup.gateway.calls[0]).toEqual({
      matchId: ids.match,
      idempotencyKey: 'stable-completion-key',
      request: {
        score: { teamA: 1, teamB: 0 },
        playerGoals: [{ playerId: ids.playerA, goals: 1 }],
      },
    });
    expect(setup.controller.currentState).toMatchObject({
      status: 'FINISHED',
      outcome: 'SAVED',
    });
  });

  it('preserves and reuses the exact key and body after a network failure', async () => {
    const setup = createController();
    await start(setup.controller);
    await setup.controller.increment(ids.playerA);
    setup.gateway.completeImplementation = vi
      .fn()
      .mockRejectedValueOnce(new ApiClientError(0, 'NETWORK_ERROR', 'offline'))
      .mockResolvedValueOnce({
        match: finishedMatch(),
        idempotentReplay: true,
      });

    await setup.controller.finish();
    expect(setup.controller.currentState).toMatchObject({
      status: 'SCORING',
      notice: { code: 'COMPLETION_UNCONFIRMED' },
      draft: {
        completion: {
          state: 'PENDING',
          idempotencyKey: 'stable-completion-key',
        },
      },
    });
    await setup.controller.finish();

    expect(setup.gateway.calls).toHaveLength(2);
    expect(setup.gateway.calls[1]).toEqual(setup.gateway.calls[0]);
    expect(setup.controller.currentState.status).toBe('FINISHED');
  });

  it('ignores late goal taps while a durable completion attempt is pending', async () => {
    const setup = createController();
    await start(setup.controller);
    setup.gateway.completeImplementation = vi
      .fn()
      .mockRejectedValue(new ApiClientError(0, 'NETWORK_ERROR', 'offline'));

    await setup.controller.finish();
    await setup.controller.increment(ids.playerA);

    expect(setup.controller.currentState).toMatchObject({
      status: 'SCORING',
      notice: { code: 'COMPLETION_UNCONFIRMED' },
      draft: {
        score: { teamA: 0, teamB: 0 },
        completion: { state: 'PENDING' },
      },
    });
  });

  it('clears an unconsumed completion attempt after 422 and allows correction', async () => {
    const setup = createController();
    await start(setup.controller);
    setup.gateway.completeImplementation = vi
      .fn()
      .mockRejectedValue(
        new ApiClientError(422, 'GOAL_TOTAL_MISMATCH', 'Invalid result.'),
      );

    await setup.controller.finish();

    expect(setup.controller.currentState).toMatchObject({
      status: 'SCORING',
      notice: {
        code: 'COMPLETION_UNCONFIRMED',
        detail: 'Invalid result.',
      },
      draft: {
        completion: {
          state: 'ACTIVE',
          idempotencyKey: null,
          canonicalRequestHash: null,
        },
      },
    });
    await setup.controller.increment(ids.playerA);
    expect(setup.controller.currentState).toMatchObject({
      draft: { score: { teamA: 1 } },
    });
  });

  it('uses a new key after a validation failure permits a changed payload', async () => {
    const repository = new MemoryDraftRepository();
    const gateway = new FakeGateway();
    const keys = ['first-attempt-key', 'corrected-attempt-key'];
    const completionCrypto: CompletionCrypto = {
      createIdempotencyKey: () => keys.shift() ?? 'unexpected-key',
      hashCanonicalPayload: async (payload) =>
        payload.includes(`"teamA":0`) ? 'a'.repeat(64) : 'b'.repeat(64),
    };
    const setup = createController(repository, gateway, completionCrypto);
    await start(setup.controller);
    gateway.completeImplementation = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiClientError(422, 'INVALID_SCORE', 'Correct the score.'),
      )
      .mockResolvedValueOnce({
        match: finishedMatch(),
        idempotentReplay: false,
      });

    await setup.controller.finish();
    await setup.controller.increment(ids.playerA);
    await setup.controller.finish();

    expect(gateway.calls.map(({ idempotencyKey }) => idempotencyKey)).toEqual([
      'first-attempt-key',
      'corrected-attempt-key',
    ]);
    expect(gateway.calls[0]?.request).not.toEqual(gateway.calls[1]?.request);
  });

  it('fetches the winning authoritative result on 409 before deleting the draft', async () => {
    const setup = createController();
    await start(setup.controller);
    setup.gateway.completeImplementation = vi
      .fn()
      .mockRejectedValue(
        new ApiClientError(409, 'MATCH_ALREADY_FINISHED', 'Already finished.'),
      );
    setup.gateway.refreshImplementation = vi.fn(async () => {
      expect(setup.repository.rows.has(`${ids.userA}:${ids.match}`)).toBe(true);
      return finishedMatch({ teamA: 0, teamB: 2 });
    });

    await setup.controller.finish();

    expect(setup.controller.currentState).toMatchObject({
      status: 'FINISHED',
      outcome: 'CONFLICTED',
      match: { result: { score: { teamA: 0, teamB: 2 } } },
    });
    expect(setup.repository.rows.has(`${ids.userA}:${ids.match}`)).toBe(false);
  });

  it('removes a stale draft when authoritative server state is FINISHED', async () => {
    const setup = createController();
    await start(setup.controller);

    await setup.controller.initialize(ids.userA, finishedMatch());

    expect(setup.controller.currentState.status).toBe('FINISHED');
    expect(setup.repository.rows.has(`${ids.userA}:${ids.match}`)).toBe(false);
  });

  it('removes a stale draft when authoritative server state is CANCELLED', async () => {
    const setup = createController();
    await start(setup.controller);

    await setup.controller.initialize(
      ids.userA,
      inProgressMatch({ status: 'CANCELLED' }),
    );

    expect(setup.controller.currentState.status).toBe('UNAVAILABLE');
    expect(setup.repository.rows.has(`${ids.userA}:${ids.match}`)).toBe(false);
  });
});
