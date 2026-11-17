import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  canonicalizePartition,
  generateTeams as generateBalancedTeams,
} from '@teamizer/algorithm';
import {
  Attendance,
  MatchStatus,
  PlayerStatus,
  PlayerType,
  Prisma,
  TeamGenerationMode,
  TeamSide,
  UserRole,
} from '@prisma/client';

import type { AuthenticatedUser } from '../auth/auth.types';
import { AvatarService } from '../avatars/avatar.service';
import { ApiError } from '../common/errors/api-error';
import { mapPlayerPublic } from '../players/player.mapper';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AddParticipantRequestDto,
  AddParticipantResponseDto,
  AttendanceRequestDto,
  CompleteMatchRequestDto,
  MatchDetailDto,
  MatchListQueryDto,
  MatchParticipantDto,
  MatchPlayerProjection,
  PaginatedMatchesDto,
  StartMatchRequestDto,
  TeamProposalDto,
  UpcomingMatchSummaryDto,
} from './match.dto';
import {
  mapMatchDetail,
  mapMatchParticipant,
  mapMatchSummary,
  mapUpcomingMatchSummary,
} from './match.mapper';
import { ProposalReceiptService } from './proposal-receipt.service';
import { TeamGenerationDataService } from './team-generation-data.service';

const DEFAULT_PAGE_SIZE = 25;
const TEAM_PROPOSAL_TRANSACTION_MAX_ATTEMPTS = 3;
const PRISMA_TRANSACTION_CONFLICT_ERROR_CODE = 'P2034';
const PRISMA_RAW_QUERY_ERROR_CODE = 'P2010';
const POSTGRES_SERIALIZATION_FAILURE_CODE = '40001';
const POSTGRES_INTEGER_MAX = 2_147_483_647;

const sportSummarySelect = Prisma.validator<Prisma.SportSelect>()({
  id: true,
  name: true,
  teamsPerMatch: true,
  playersOnFieldPerTeam: true,
});

const matchPlayerSelect = Prisma.validator<Prisma.PlayerSelect>()({
  id: true,
  name: true,
  type: true,
  status: true,
  avatarStorageKey: true,
});

const matchDetailInclude = Prisma.validator<Prisma.MatchInclude>()({
  sport: { select: sportSummarySelect },
  participants: {
    include: { player: { select: matchPlayerSelect } },
    orderBy: [{ player: { name: 'asc' } }, { playerId: 'asc' }],
  },
  teams: {
    include: {
      memberships: {
        include: { player: { select: matchPlayerSelect } },
        orderBy: [{ player: { name: 'asc' } }, { playerId: 'asc' }],
      },
    },
    orderBy: { side: 'asc' },
  },
  matchPlayerStats: { orderBy: { playerId: 'asc' } },
});

type LockedMatch = {
  id: string;
  status: MatchStatus;
  stateVersion: number;
};

type MatchCursor = {
  startsAt: string;
  id: string;
  direction: 'asc' | 'desc';
  status: MatchStatus | null;
};

type CanonicalCompletionPayload = {
  score: { teamA: number; teamB: number };
  playerGoals: Array<{ playerId: string; goals: number }>;
};

type CompleteMatchResult = {
  match: MatchDetailDto;
  idempotentReplay: boolean;
};

@Injectable()
export class MatchesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ProposalReceiptService)
    private readonly proposalReceipts: ProposalReceiptService,
    @Inject(TeamGenerationDataService)
    private readonly teamGenerationData: TeamGenerationDataService,
    @Inject(AvatarService) private readonly avatars: AvatarService,
  ) {}

  async list(query: MatchListQueryDto): Promise<PaginatedMatchesDto> {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const direction = this.listDirection(query.status);
    const cursor = query.cursor
      ? this.decodeCursor(query.cursor, direction, query.status ?? null)
      : null;
    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;

    if (from && to && from > to) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'The from timestamp must not be later than the to timestamp.',
        [
          {
            field: 'from',
            code: 'INVALID_RANGE',
            message: 'from must be earlier than or equal to to',
          },
        ],
      );
    }

    const matches = await this.prisma.match.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        startsAt: {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: to } : {}),
        },
        ...(cursor
          ? {
              OR: [
                {
                  startsAt:
                    direction === 'asc'
                      ? { gt: new Date(cursor.startsAt) }
                      : { lt: new Date(cursor.startsAt) },
                },
                {
                  startsAt: new Date(cursor.startsAt),
                  id:
                    direction === 'asc' ? { gt: cursor.id } : { lt: cursor.id },
                },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        startsAt: true,
        location: true,
        status: true,
        stateVersion: true,
        sport: { select: sportSummarySelect },
      },
      orderBy: [{ startsAt: direction }, { id: direction }],
      take: limit + 1,
    });
    const hasNextPage = matches.length > limit;
    const page = matches.slice(0, limit);
    const lastMatch = page.at(-1);

    return {
      items: page.map(mapMatchSummary),
      nextCursor:
        hasNextPage && lastMatch
          ? this.encodeCursor({
              startsAt: lastMatch.startsAt.toISOString(),
              id: lastMatch.id,
              direction,
              status: query.status ?? null,
            })
          : null,
    };
  }

  async upcoming(callerPlayerId: string): Promise<UpcomingMatchSummaryDto[]> {
    const matches = await this.prisma.match.findMany({
      where: {
        status: {
          in: [MatchStatus.OPEN_FOR_REGISTRATION, MatchStatus.IN_PROGRESS],
        },
      },
      select: {
        id: true,
        startsAt: true,
        location: true,
        status: true,
        stateVersion: true,
        sport: { select: sportSummarySelect },
        participants: {
          where: { playerId: callerPlayerId },
          select: { attendance: true },
        },
      },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });

    return matches.map(mapUpcomingMatchSummary);
  }

  async detail(
    matchId: string,
    callerPlayerId: string,
  ): Promise<MatchDetailDto> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: matchDetailInclude,
    });

    if (!match) {
      throw this.matchNotFound();
    }

    const participantIds = match.participants.map(({ playerId }) => playerId);
    const unansweredPlayers = await this.prisma.player.findMany({
      where: {
        status: PlayerStatus.ACTIVE,
        ...(participantIds.length > 0 ? { id: { notIn: participantIds } } : {}),
      },
      select: matchPlayerSelect,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });

    return mapMatchDetail(match, callerPlayerId, unansweredPlayers, (key) =>
      this.avatars.urlFor(key),
    );
  }

  async registerGoing(
    matchId: string,
    callerPlayerId: string,
  ): Promise<{ attendance: 'GOING' }> {
    await this.inMatchTransaction(async (transaction) => {
      await this.lockOpenMatch(transaction, matchId);
      const changed = await this.setAttendance(
        transaction,
        matchId,
        callerPlayerId,
        Attendance.GOING,
      );
      await this.incrementStateVersionIfChanged(transaction, matchId, changed);
    });

    return { attendance: Attendance.GOING };
  }

  async removeRegistration(
    matchId: string,
    callerPlayerId: string,
  ): Promise<void> {
    await this.inMatchTransaction(async (transaction) => {
      await this.lockOpenMatch(transaction, matchId);
      const deleted = await transaction.matchParticipant.deleteMany({
        where: { matchId, playerId: callerPlayerId },
      });
      await this.incrementStateVersionIfChanged(
        transaction,
        matchId,
        deleted.count > 0,
      );
    });
  }

  async patchParticipant(
    matchId: string,
    playerId: string,
    request: AttendanceRequestDto,
    actor: AuthenticatedUser,
  ): Promise<MatchParticipantDto> {
    return this.inMatchTransaction(async (transaction) => {
      await this.lockOpenMatch(transaction, matchId);
      this.assertMayManageExistingPlayer(actor, playerId);
      await this.requireActivePlayer(transaction, playerId);
      const changed = await this.setAttendance(
        transaction,
        matchId,
        playerId,
        request.attendance,
      );
      await this.incrementStateVersionIfChanged(transaction, matchId, changed);

      return {
        matchId,
        playerId,
        attendance: request.attendance,
      };
    });
  }

  async addParticipant(
    matchId: string,
    request: AddParticipantRequestDto,
    actor: AuthenticatedUser,
  ): Promise<AddParticipantResponseDto> {
    this.assertTaggedParticipantRequest(request);

    return this.inMatchTransaction(async (transaction) => {
      await this.lockOpenMatch(transaction, matchId);

      if (request.playerId) {
        if (actor.role !== UserRole.ADMIN) {
          throw this.forbidden();
        }

        await this.requireActivePlayer(transaction, request.playerId);
        const changed = await this.setAttendance(
          transaction,
          matchId,
          request.playerId,
          Attendance.GOING,
        );
        await this.incrementStateVersionIfChanged(
          transaction,
          matchId,
          changed,
        );

        return {
          participant: {
            matchId,
            playerId: request.playerId,
            attendance: Attendance.GOING,
          },
        };
      }

      const guestInput = request.guest;

      if (!guestInput) {
        throw this.invalidParticipantRequest();
      }

      const guest = await transaction.player.create({
        data: {
          name: guestInput.name.trim(),
          type: PlayerType.GUEST,
          ...guestInput.attributes,
        },
        select: matchPlayerSelect,
      });
      const participant = await transaction.matchParticipant.create({
        data: {
          matchId,
          playerId: guest.id,
          attendance: Attendance.GOING,
        },
      });
      await this.incrementStateVersionIfChanged(transaction, matchId, true);

      return {
        participant: mapMatchParticipant(participant),
        player: mapPlayerPublic(guest, (key) => this.avatars.urlFor(key)),
      };
    });
  }

  async generateTeamProposal(matchId: string): Promise<TeamProposalDto> {
    return this.inTeamProposalTransaction(async (transaction) => {
      const match = await this.lockMatch(transaction, matchId);

      if (match.status !== MatchStatus.OPEN_FOR_REGISTRATION) {
        throw new ApiError(
          409,
          'MATCH_NOT_OPEN',
          'Teams can only be generated for an open Match.',
        );
      }

      const context = await this.teamGenerationData.load(transaction, matchId);
      this.validateGenerationContext(context);
      const result = generateBalancedTeams(context.input);
      const proposalReceipt = this.proposalReceipts.sign({
        matchId,
        matchStateVersion: match.stateVersion,
        generatedTeamAPlayerIds: result.teamA,
        generatedTeamBPlayerIds: result.teamB,
        algorithmVersion: result.algorithmVersion,
        configurationVersion: result.configurationVersion,
      });

      return {
        teamAPlayerIds: result.teamA,
        teamBPlayerIds: result.teamB,
        balance: {
          balanceScore: result.balanceScore,
          historyScore: result.historyScore,
        },
        algorithmVersion: result.algorithmVersion,
        configurationVersion: result.configurationVersion,
        proposalReceipt,
      };
    });
  }

  async start(
    matchId: string,
    request: StartMatchRequestDto,
    callerPlayerId: string,
  ): Promise<MatchDetailDto> {
    await this.inMatchTransaction(async (transaction) => {
      const match = await this.lockMatch(transaction, matchId);

      if (match.status !== MatchStatus.OPEN_FOR_REGISTRATION) {
        throw new ApiError(
          409,
          'MATCH_NOT_OPEN',
          'Only an open Match can be started.',
        );
      }

      const receipt = this.proposalReceipts.verify(request.proposalReceipt);

      if (receipt.matchId !== matchId) {
        throw new ApiError(
          409,
          'PROPOSAL_RECEIPT_INVALID',
          'The proposal receipt belongs to a different Match.',
        );
      }

      if (receipt.matchStateVersion !== match.stateVersion) {
        throw new ApiError(
          409,
          'CONCURRENT_STATE_CHANGE',
          'Match attendance changed after this proposal was generated.',
        );
      }

      await this.lockGoingPlayers(transaction, matchId);
      const context = await this.teamGenerationData.load(transaction, matchId);
      this.validateGenerationContext(context);
      this.validateSelectedTeams(request, context.input.participantIds);
      const submittedCanonical = canonicalizePartition(
        request.teamAPlayerIds,
        request.teamBPlayerIds,
      );
      const generatedCanonical = canonicalizePartition(
        receipt.generatedTeamAPlayerIds,
        receipt.generatedTeamBPlayerIds,
      );
      const generationMode =
        submittedCanonical.canonicalKey === generatedCanonical.canonicalKey
          ? TeamGenerationMode.ALGORITHM
          : TeamGenerationMode.MANUAL_ADJUSTMENT;
      const [teamA, teamB] = await Promise.all([
        transaction.team.create({
          data: { matchId, side: TeamSide.A },
          select: { id: true },
        }),
        transaction.team.create({
          data: { matchId, side: TeamSide.B },
          select: { id: true },
        }),
      ]);

      await transaction.teamMembership.createMany({
        data: [
          ...request.teamAPlayerIds.map((playerId) => ({
            matchId,
            playerId,
            teamId: teamA.id,
          })),
          ...request.teamBPlayerIds.map((playerId) => ({
            matchId,
            playerId,
            teamId: teamB.id,
          })),
        ],
      });
      await transaction.match.update({
        where: { id: matchId },
        data: {
          status: MatchStatus.IN_PROGRESS,
          startedAt: new Date(),
          teamGenerationMode: generationMode,
          algorithmVersion: receipt.algorithmVersion,
          configurationVersion: receipt.configurationVersion,
          stateVersion: { increment: 1 },
        },
      });
    });

    return this.detail(matchId, callerPlayerId);
  }

  async complete(
    matchId: string,
    idempotencyKey: string | undefined,
    request: CompleteMatchRequestDto,
    callerPlayerId: string,
  ): Promise<CompleteMatchResult> {
    const validatedIdempotencyKey = this.requireIdempotencyKey(idempotencyKey);
    const transactionResult = await this.inMatchTransaction(
      async (transaction) => {
        const match = await this.lockMatch(transaction, matchId);
        const existingIdempotency =
          await transaction.matchCompletionIdempotency.findUnique({
            where: {
              matchId_idempotencyKey: {
                matchId,
                idempotencyKey: validatedIdempotencyKey,
              },
            },
            select: { requestHash: true },
          });

        if (!existingIdempotency && match.status !== MatchStatus.IN_PROGRESS) {
          if (match.status === MatchStatus.FINISHED) {
            throw new ApiError(
              409,
              'MATCH_ALREADY_FINISHED',
              'The Match has already been completed.',
            );
          }

          throw new ApiError(
            409,
            'MATCH_NOT_IN_PROGRESS',
            'Only an in-progress Match can be completed.',
          );
        }

        const finalPlayerIds = await this.loadFinalTeamPlayerIds(
          transaction,
          matchId,
        );
        const canonicalPayload = this.canonicalizeCompletion(
          request,
          finalPlayerIds,
        );
        const requestHash = this.hashCompletion(canonicalPayload);

        if (existingIdempotency) {
          if (existingIdempotency.requestHash.trimEnd() !== requestHash) {
            throw new ApiError(
              409,
              'IDEMPOTENCY_KEY_REUSED',
              'This idempotency key was already used for another completion.',
            );
          }

          return { idempotentReplay: true };
        }

        await transaction.matchCompletionIdempotency.create({
          data: {
            matchId,
            idempotencyKey: validatedIdempotencyKey,
            requestHash,
          },
        });
        await transaction.matchPlayerStat.createMany({
          data: canonicalPayload.playerGoals.map(({ playerId, goals }) => ({
            matchId,
            playerId,
            goals,
          })),
        });
        await transaction.match.update({
          where: { id: matchId },
          data: {
            teamAScore: canonicalPayload.score.teamA,
            teamBScore: canonicalPayload.score.teamB,
            completedAt: new Date(),
            status: MatchStatus.FINISHED,
            stateVersion: { increment: 1 },
          },
        });

        return { idempotentReplay: false };
      },
    );

    return {
      match: await this.detail(matchId, callerPlayerId),
      idempotentReplay: transactionResult.idempotentReplay,
    };
  }

  async cancel(
    matchId: string,
    actor: AuthenticatedUser,
  ): Promise<MatchDetailDto> {
    await this.inMatchTransaction(async (transaction) => {
      const match = await this.lockMatch(transaction, matchId);

      if (match.status !== MatchStatus.OPEN_FOR_REGISTRATION) {
        if (match.status === MatchStatus.CANCELLED) {
          throw new ApiError(
            409,
            'MATCH_CANCELLED',
            'The Match has already been cancelled.',
          );
        }

        throw new ApiError(
          409,
          'MATCH_NOT_OPEN',
          'Only an open Match can be cancelled.',
        );
      }

      await transaction.match.update({
        where: { id: matchId },
        data: {
          status: MatchStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledByUserId: actor.id,
          stateVersion: { increment: 1 },
        },
      });
    });

    return this.detail(matchId, actor.player.id);
  }

  private async inMatchTransaction<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(operation, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    });
  }

  private async inTeamProposalTransaction<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    let attempt = 1;

    while (true) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        });
      } catch (error) {
        if (
          attempt >= TEAM_PROPOSAL_TRANSACTION_MAX_ATTEMPTS ||
          !this.isRetryableTransactionError(error)
        ) {
          throw error;
        }

        attempt += 1;
      }
    }
  }

  private isRetryableTransactionError(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return false;
    }

    return (
      error.code === PRISMA_TRANSACTION_CONFLICT_ERROR_CODE ||
      (error.code === PRISMA_RAW_QUERY_ERROR_CODE &&
        error.meta?.code === POSTGRES_SERIALIZATION_FAILURE_CODE)
    );
  }

  private async lockOpenMatch(
    transaction: Prisma.TransactionClient,
    matchId: string,
  ): Promise<LockedMatch> {
    const match = await this.lockMatch(transaction, matchId);

    if (match.status !== MatchStatus.OPEN_FOR_REGISTRATION) {
      throw new ApiError(
        409,
        'ATTENDANCE_LOCKED',
        'Attendance can only change while the Match is open.',
      );
    }

    return match;
  }

  private async lockGoingPlayers(
    transaction: Prisma.TransactionClient,
    matchId: string,
  ): Promise<void> {
    await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT player."id"
      FROM "Player" AS player
      INNER JOIN "MatchParticipant" AS participant
        ON participant."playerId" = player."id"
      WHERE participant."matchId" = ${matchId}::uuid
        AND participant."attendance" = ${Attendance.GOING}::"Attendance"
      ORDER BY player."id" ASC
      FOR UPDATE OF player
    `;
  }

  private requireIdempotencyKey(idempotencyKey: string | undefined): string {
    const characterCount =
      idempotencyKey === undefined ? 0 : Array.from(idempotencyKey).length;

    if (
      idempotencyKey === undefined ||
      characterCount < 8 ||
      characterCount > 255
    ) {
      throw new ApiError(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Idempotency-Key must contain between 8 and 255 characters.',
      );
    }

    return idempotencyKey;
  }

  private async loadFinalTeamPlayerIds(
    transaction: Prisma.TransactionClient,
    matchId: string,
  ): Promise<string[]> {
    const teams = await transaction.team.findMany({
      where: { matchId },
      select: {
        side: true,
        memberships: {
          select: { playerId: true },
          orderBy: { playerId: 'asc' },
        },
      },
      orderBy: { side: 'asc' },
    });
    const teamA = teams.find(({ side }) => side === TeamSide.A);
    const teamB = teams.find(({ side }) => side === TeamSide.B);

    if (
      teams.length !== 2 ||
      !teamA ||
      !teamB ||
      teamA.memberships.length === 0 ||
      teamB.memberships.length === 0
    ) {
      throw this.invalidPlayerGoals(
        'The Match does not have two complete persisted final teams.',
        'FINAL_TEAMS_MISSING',
      );
    }

    return [...teamA.memberships, ...teamB.memberships]
      .map(({ playerId }) => playerId)
      .sort(this.compareIds);
  }

  private canonicalizeCompletion(
    request: CompleteMatchRequestDto,
    finalPlayerIds: string[],
  ): CanonicalCompletionPayload {
    if (
      !Number.isInteger(request.score.teamA) ||
      request.score.teamA < 0 ||
      request.score.teamA > POSTGRES_INTEGER_MAX ||
      !Number.isInteger(request.score.teamB) ||
      request.score.teamB < 0 ||
      request.score.teamB > POSTGRES_INTEGER_MAX
    ) {
      throw new ApiError(
        422,
        'INVALID_SCORE',
        'Both final scores must be non-negative integers.',
        [
          {
            field: 'score',
            code: 'INVALID_SCORE',
            message: 'Both final scores must be non-negative integers.',
          },
        ],
      );
    }

    const finalPlayerIdSet = new Set(finalPlayerIds);
    const submittedGoals = new Map<string, number>();

    for (const playerGoals of request.playerGoals) {
      if (submittedGoals.has(playerGoals.playerId)) {
        throw this.invalidPlayerGoals(
          'A Player may appear only once in playerGoals.',
          'DUPLICATE_PLAYER',
        );
      }

      if (!finalPlayerIdSet.has(playerGoals.playerId)) {
        throw this.invalidPlayerGoals(
          'Every submitted Player must belong to a persisted final team.',
          'NON_TEAM_PLAYER',
        );
      }

      if (
        !Number.isInteger(playerGoals.goals) ||
        playerGoals.goals < 0 ||
        playerGoals.goals > POSTGRES_INTEGER_MAX
      ) {
        throw this.invalidPlayerGoals(
          'Player goals must be non-negative integers.',
          'INVALID_GOALS',
        );
      }

      submittedGoals.set(playerGoals.playerId, playerGoals.goals);
    }

    const normalizedPlayerGoals = finalPlayerIds.map((playerId) => ({
      playerId,
      goals: submittedGoals.get(playerId) ?? 0,
    }));
    const goalTotal = normalizedPlayerGoals.reduce(
      (total, { goals }) => total + goals,
      0,
    );

    if (goalTotal !== request.score.teamA + request.score.teamB) {
      throw new ApiError(
        422,
        'GOAL_TOTAL_MISMATCH',
        'Player goal totals must equal the combined final score.',
        [
          {
            field: 'playerGoals',
            code: 'GOAL_TOTAL_MISMATCH',
            message: 'Player goal totals must equal teamA plus teamB.',
          },
        ],
      );
    }

    return {
      score: { teamA: request.score.teamA, teamB: request.score.teamB },
      playerGoals: normalizedPlayerGoals,
    };
  }

  private hashCompletion(payload: CanonicalCompletionPayload): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private invalidPlayerGoals(message: string, code: string): ApiError {
    return new ApiError(422, 'INVALID_PLAYER_GOALS', message, [
      { field: 'playerGoals', code, message },
    ]);
  }

  private compareIds(left: string, right: string): number {
    if (left < right) {
      return -1;
    }

    if (left > right) {
      return 1;
    }

    return 0;
  }

  private async lockMatch(
    transaction: Prisma.TransactionClient,
    matchId: string,
  ): Promise<LockedMatch> {
    const matches = await transaction.$queryRaw<LockedMatch[]>`
      SELECT "id", "status", "stateVersion"
      FROM "Match"
      WHERE "id" = ${matchId}::uuid
      FOR UPDATE
    `;
    const match = matches[0];

    if (!match) {
      throw this.matchNotFound();
    }

    return match;
  }

  private async setAttendance(
    transaction: Prisma.TransactionClient,
    matchId: string,
    playerId: string,
    attendance: Attendance,
  ): Promise<boolean> {
    const existing = await transaction.matchParticipant.findUnique({
      where: { matchId_playerId: { matchId, playerId } },
      select: { attendance: true },
    });

    if (existing?.attendance === attendance) {
      return false;
    }

    await transaction.matchParticipant.upsert({
      where: { matchId_playerId: { matchId, playerId } },
      create: { matchId, playerId, attendance },
      update: { attendance },
    });

    return true;
  }

  private async incrementStateVersionIfChanged(
    transaction: Prisma.TransactionClient,
    matchId: string,
    changed: boolean,
  ): Promise<void> {
    if (!changed) {
      return;
    }

    await transaction.match.update({
      where: { id: matchId },
      data: { stateVersion: { increment: 1 } },
    });
  }

  private assertMayManageExistingPlayer(
    actor: AuthenticatedUser,
    targetPlayerId: string,
  ): void {
    if (actor.role !== UserRole.ADMIN && actor.player.id !== targetPlayerId) {
      throw this.forbidden();
    }
  }

  private validateGenerationContext(context: {
    input: { participantIds: string[] };
    inactiveGoingPlayerIds: string[];
    teamsPerMatch: number;
  }): void {
    if (context.inactiveGoingPlayerIds.length > 0) {
      throw new ApiError(
        422,
        'INACTIVE_PARTICIPANT',
        'Every going participant must still be active.',
        context.inactiveGoingPlayerIds.map((playerId) => ({
          field: 'participants',
          code: 'INACTIVE_PLAYER',
          message: `Player ${playerId} is inactive.`,
        })),
      );
    }

    if (context.input.participantIds.length < 2) {
      throw new ApiError(
        422,
        'INSUFFICIENT_GOING_PLAYERS',
        'At least two going Players are required.',
      );
    }

    if (context.teamsPerMatch !== 2) {
      throw new ApiError(
        422,
        'INVALID_TEAM_COMPOSITION',
        'The Match Sport must use exactly two teams in the MVP.',
      );
    }
  }

  private validateSelectedTeams(
    request: StartMatchRequestDto,
    goingPlayerIds: string[],
  ): void {
    if (
      request.teamAPlayerIds.length === 0 ||
      request.teamBPlayerIds.length === 0
    ) {
      throw this.invalidTeamComposition(
        'Both final teams must be non-empty.',
        'EMPTY_TEAM',
      );
    }

    if (
      Math.abs(request.teamAPlayerIds.length - request.teamBPlayerIds.length) >
      1
    ) {
      throw this.invalidTeamComposition(
        'Final team sizes must differ by at most one.',
        'UNBALANCED_TEAM_SIZE',
      );
    }

    const submittedPlayerIds = [
      ...request.teamAPlayerIds,
      ...request.teamBPlayerIds,
    ];
    const submittedSet = new Set(submittedPlayerIds);

    if (submittedSet.size !== submittedPlayerIds.length) {
      throw this.invalidTeamComposition(
        'A Player cannot appear more than once in the final teams.',
        'DUPLICATE_PLAYER',
      );
    }

    const goingSet = new Set(goingPlayerIds);
    const includesNonGoing = submittedPlayerIds.some(
      (playerId) => !goingSet.has(playerId),
    );

    if (includesNonGoing) {
      throw this.invalidTeamComposition(
        'Only current GOING Players may appear in final teams.',
        'NON_GOING_PLAYER',
      );
    }

    if (
      submittedSet.size !== goingSet.size ||
      goingPlayerIds.some((playerId) => !submittedSet.has(playerId))
    ) {
      throw this.invalidTeamComposition(
        'Every current GOING Player must appear exactly once.',
        'MISSING_PLAYER',
      );
    }
  }

  private invalidTeamComposition(message: string, code: string): ApiError {
    return new ApiError(422, 'INVALID_TEAM_COMPOSITION', message, [
      { field: 'teamAPlayerIds', code, message },
    ]);
  }

  private async requireActivePlayer(
    transaction: Prisma.TransactionClient,
    playerId: string,
  ): Promise<MatchPlayerProjection> {
    const player = await transaction.player.findUnique({
      where: { id: playerId },
      select: matchPlayerSelect,
    });

    if (!player || player.status !== PlayerStatus.ACTIVE) {
      throw new ApiError(
        422,
        'INACTIVE_PARTICIPANT',
        'The requested participant does not exist or is inactive.',
      );
    }

    return player;
  }

  private assertTaggedParticipantRequest(
    request: AddParticipantRequestDto,
  ): void {
    if (Boolean(request.playerId) === Boolean(request.guest)) {
      throw this.invalidParticipantRequest();
    }
  }

  private invalidParticipantRequest(): ApiError {
    return new ApiError(
      400,
      'VALIDATION_ERROR',
      'Supply exactly one of playerId or guest.',
      [
        {
          field: 'playerId',
          code: 'INVALID_TAGGED_UNION',
          message: 'Supply exactly one of playerId or guest.',
        },
      ],
    );
  }

  private forbidden(): ApiError {
    return new ApiError(
      403,
      'FORBIDDEN',
      'You do not have permission to manage this participant.',
    );
  }

  private matchNotFound(): ApiError {
    return new ApiError(
      404,
      'RESOURCE_NOT_FOUND',
      'The requested Match does not exist.',
    );
  }

  private listDirection(status: MatchStatus | undefined): 'asc' | 'desc' {
    return status === MatchStatus.FINISHED || status === MatchStatus.CANCELLED
      ? 'desc'
      : 'asc';
  }

  private encodeCursor(cursor: MatchCursor): string {
    return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
  }

  private decodeCursor(
    encoded: string,
    direction: MatchCursor['direction'],
    status: MatchStatus | null,
  ): MatchCursor {
    try {
      const parsed: unknown = JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8'),
      );

      if (!this.isMatchCursor(parsed, direction, status)) {
        throw new Error('Invalid cursor');
      }

      return parsed;
    } catch {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'The pagination cursor is invalid for this query.',
        [
          {
            field: 'cursor',
            code: 'INVALID_CURSOR',
            message: 'cursor is invalid for this query',
          },
        ],
      );
    }
  }

  private isMatchCursor(
    value: unknown,
    direction: MatchCursor['direction'],
    status: MatchStatus | null,
  ): value is MatchCursor {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate.startsAt === 'string' &&
      !Number.isNaN(Date.parse(candidate.startsAt)) &&
      typeof candidate.id === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        candidate.id,
      ) &&
      candidate.direction === direction &&
      candidate.status === status
    );
  }
}
