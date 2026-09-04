import { AlgorithmConfigV1 } from './config.js';
import type {
  HistoricalMatch,
  RatedPlayer,
  ScoredTeamPartition,
  TeamGenerationBreakdown,
  TeamPartition,
  TeamProfile,
} from './types.js';

const attributeNames = [
  'speed',
  'endurance',
  'defense',
  'attack',
  'technique',
] as const;

export function createTeamProfile(players: RatedPlayer[]): TeamProfile {
  if (players.length === 0) {
    throw new Error('A team profile requires at least one Player.');
  }

  const size = players.length;
  return {
    rating: players.reduce((sum, player) => sum + player.rating, 0) / size,
    attributes: {
      speed:
        players.reduce(
          (sum, player) => sum + player.normalizedAttributes.speed,
          0,
        ) / size,
      endurance:
        players.reduce(
          (sum, player) => sum + player.normalizedAttributes.endurance,
          0,
        ) / size,
      defense:
        players.reduce(
          (sum, player) => sum + player.normalizedAttributes.defense,
          0,
        ) / size,
      attack:
        players.reduce(
          (sum, player) => sum + player.normalizedAttributes.attack,
          0,
        ) / size,
      technique:
        players.reduce(
          (sum, player) => sum + player.normalizedAttributes.technique,
          0,
        ) / size,
    },
  };
}

export function calculateBalanceBreakdown(
  teamA: RatedPlayer[],
  teamB: RatedPlayer[],
): {
  strengthDifference: number;
  attributeDifference: number;
  balanceScore: number;
} {
  const profileA = createTeamProfile(teamA);
  const profileB = createTeamProfile(teamB);
  const strengthDifference = Math.abs(profileA.rating - profileB.rating);
  const attributeDifference = attributeNames.reduce(
    (sum, attribute) =>
      sum +
      AlgorithmConfigV1.attributes[attribute] *
        Math.abs(
          profileA.attributes[attribute] - profileB.attributes[attribute],
        ),
    0,
  );
  const balanceScore =
    AlgorithmConfigV1.balance.overallStrengthWeight * strengthDifference +
    AlgorithmConfigV1.balance.attributeDifferenceWeight * attributeDifference;

  return { strengthDifference, attributeDifference, balanceScore };
}

export function calculateBalanceTolerance(bestBalanceScore: number): number {
  return Math.max(
    bestBalanceScore * (1 + AlgorithmConfigV1.balance.relativeTolerance),
    bestBalanceScore + AlgorithmConfigV1.balance.absoluteTolerance,
  );
}

function sameMembers(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const rightMembers = new Set(right);
  return left.every((playerId) => rightMembers.has(playerId));
}

function exactTeamMatch(
  team: string[],
  historicalMatch: HistoricalMatch,
): 0 | 1 {
  return sameMembers(team, historicalMatch.teamAPlayerIds) ||
    sameMembers(team, historicalMatch.teamBPlayerIds)
    ? 1
    : 0;
}

function historyWeightTotal(history: HistoricalMatch[]): number {
  return history.reduce(
    (sum, _match, index) =>
      sum + (AlgorithmConfigV1.history.recencyDecay[index] ?? 0),
    0,
  );
}

function teamRepeat(
  team: string[],
  history: HistoricalMatch[],
  denominator: number,
): number {
  return (
    history.reduce(
      (sum, historicalMatch, index) =>
        sum +
        (AlgorithmConfigV1.history.recencyDecay[index] ?? 0) *
          exactTeamMatch(team, historicalMatch),
      0,
    ) / denominator
  );
}

export function calculateRepeatedTeamPenalty(
  partition: TeamPartition,
  history: HistoricalMatch[],
): number {
  if (history.length === 0) {
    return 0;
  }

  const denominator = historyWeightTotal(history);
  return (
    (teamRepeat(partition.teamA, history, denominator) +
      teamRepeat(partition.teamB, history, denominator)) /
    2
  );
}

function pairs(team: string[]): Array<readonly [string, string]> {
  const result: Array<readonly [string, string]> = [];

  for (let left = 0; left < team.length; left += 1) {
    for (let right = left + 1; right < team.length; right += 1) {
      const leftPlayer = team[left];
      const rightPlayer = team[right];

      if (leftPlayer !== undefined && rightPlayer !== undefined) {
        result.push([leftPlayer, rightPlayer]);
      }
    }
  }

  return result;
}

function sameHistoricalTeam(
  pair: readonly [string, string],
  historicalMatch: HistoricalMatch,
): 0 | 1 {
  const teamA = new Set(historicalMatch.teamAPlayerIds);
  const teamB = new Set(historicalMatch.teamBPlayerIds);
  return (teamA.has(pair[0]) && teamA.has(pair[1])) ||
    (teamB.has(pair[0]) && teamB.has(pair[1]))
    ? 1
    : 0;
}

function pairRepeat(
  team: string[],
  history: HistoricalMatch[],
  denominator: number,
): number {
  const teamPairs = pairs(team);

  if (teamPairs.length === 0) {
    return 0;
  }

  return (
    teamPairs.reduce(
      (pairTotal, pair) =>
        pairTotal +
        history.reduce(
          (historyTotal, historicalMatch, index) =>
            historyTotal +
            (AlgorithmConfigV1.history.recencyDecay[index] ?? 0) *
              sameHistoricalTeam(pair, historicalMatch),
          0,
        ) /
          denominator,
      0,
    ) / teamPairs.length
  );
}

export function calculateRepeatedTeammatePenalty(
  partition: TeamPartition,
  history: HistoricalMatch[],
): number {
  if (history.length === 0) {
    return 0;
  }

  const denominator = historyWeightTotal(history);
  return (
    (pairRepeat(partition.teamA, history, denominator) +
      pairRepeat(partition.teamB, history, denominator)) /
    2
  );
}

function overlap(team: string[], historicalTeam: string[]): number {
  const historicalPlayers = new Set(historicalTeam);
  return (
    team.filter((playerId) => historicalPlayers.has(playerId)).length /
    team.length
  );
}

function similarityRepeat(
  team: string[],
  history: HistoricalMatch[],
  denominator: number,
): number {
  return (
    history.reduce((sum, historicalMatch, index) => {
      const historicalOverlap = Math.max(
        overlap(team, historicalMatch.teamAPlayerIds),
        overlap(team, historicalMatch.teamBPlayerIds),
      );
      return (
        sum +
        (AlgorithmConfigV1.history.recencyDecay[index] ?? 0) * historicalOverlap
      );
    }, 0) / denominator
  );
}

export function calculateCompositionSimilarityPenalty(
  partition: TeamPartition,
  history: HistoricalMatch[],
): number {
  if (history.length === 0) {
    return 0;
  }

  const denominator = historyWeightTotal(history);
  return (
    (similarityRepeat(partition.teamA, history, denominator) +
      similarityRepeat(partition.teamB, history, denominator)) /
    2
  );
}

export function calculateHistoryBreakdown(
  partition: TeamPartition,
  history: HistoricalMatch[],
): {
  repeatedTeamPenalty: number;
  repeatedTeammatePenalty: number;
  compositionSimilarityPenalty: number;
  historyScore: number;
} {
  const repeatedTeamPenalty = calculateRepeatedTeamPenalty(partition, history);
  const repeatedTeammatePenalty = calculateRepeatedTeammatePenalty(
    partition,
    history,
  );
  const compositionSimilarityPenalty = calculateCompositionSimilarityPenalty(
    partition,
    history,
  );
  const historyScore =
    AlgorithmConfigV1.history.repeatedTeamWeight * repeatedTeamPenalty +
    AlgorithmConfigV1.history.repeatedTeammateWeight * repeatedTeammatePenalty +
    AlgorithmConfigV1.history.compositionSimilarityWeight *
      compositionSimilarityPenalty;

  return {
    repeatedTeamPenalty,
    repeatedTeammatePenalty,
    compositionSimilarityPenalty,
    historyScore,
  };
}

export function scorePartition(
  partition: TeamPartition,
  playersById: ReadonlyMap<string, RatedPlayer>,
  history: HistoricalMatch[],
  canonicalKey: string,
): ScoredTeamPartition {
  const teamA = partition.teamA.map((playerId) => {
    const player = playersById.get(playerId);

    if (!player) {
      throw new Error(`Missing rated Player ${playerId}.`);
    }

    return player;
  });
  const teamB = partition.teamB.map((playerId) => {
    const player = playersById.get(playerId);

    if (!player) {
      throw new Error(`Missing rated Player ${playerId}.`);
    }

    return player;
  });
  const balance = calculateBalanceBreakdown(teamA, teamB);
  const historical = calculateHistoryBreakdown(partition, history);
  const breakdown: TeamGenerationBreakdown = {
    strengthDifference: balance.strengthDifference,
    attributeDifference: balance.attributeDifference,
    repeatedTeamPenalty: historical.repeatedTeamPenalty,
    repeatedTeammatePenalty: historical.repeatedTeammatePenalty,
    compositionSimilarityPenalty: historical.compositionSimilarityPenalty,
  };

  return {
    ...partition,
    balanceScore: balance.balanceScore,
    historyScore: historical.historyScore,
    breakdown,
    canonicalKey,
  };
}
