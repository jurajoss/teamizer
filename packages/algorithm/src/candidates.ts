import { AlgorithmConfigV1, SCORE_COMPARISON_EPSILON } from './config.js';
import {
  calculateBalanceBreakdown,
  calculateBalanceTolerance,
} from './scoring.js';
import type {
  RatedPlayer,
  ScoredTeamPartition,
  TeamPartition,
} from './types.js';

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function compareStringArrays(left: string[], right: string[]): number {
  const sharedLength = Math.min(left.length, right.length);

  for (let index = 0; index < sharedLength; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];

    if (leftValue === undefined || rightValue === undefined) {
      continue;
    }

    const comparison = compareStrings(leftValue, rightValue);

    if (comparison !== 0) {
      return comparison;
    }
  }

  return left.length - right.length;
}

function comparePartitions(left: TeamPartition, right: TeamPartition): number {
  return (
    compareStringArrays(left.teamA, right.teamA) ||
    compareStringArrays(left.teamB, right.teamB)
  );
}

export function canonicalizePartition(
  teamAPlayerIds: string[],
  teamBPlayerIds: string[],
): TeamPartition & { canonicalKey: string } {
  const first = [...teamAPlayerIds].sort(compareStrings);
  const second = [...teamBPlayerIds].sort(compareStrings);
  const [teamA, teamB] =
    compareStringArrays(first, second) <= 0 ? [first, second] : [second, first];

  return {
    teamA,
    teamB,
    canonicalKey: JSON.stringify([teamA, teamB]),
  };
}

function combinations(values: string[], size: number): string[][] {
  const result: string[][] = [];

  function visit(start: number, selected: string[]): void {
    if (selected.length === size) {
      result.push([...selected]);
      return;
    }

    const remaining = size - selected.length;

    for (let index = start; index <= values.length - remaining; index += 1) {
      const value = values[index];

      if (value !== undefined) {
        selected.push(value);
        visit(index + 1, selected);
        selected.pop();
      }
    }
  }

  visit(0, []);
  return result;
}

export function enumerateUniquePartitions(
  playerIds: string[],
): TeamPartition[] {
  const sortedIds = [...playerIds].sort(compareStrings);

  if (sortedIds.length < 2) {
    return [];
  }

  const targetSize = Math.ceil(sortedIds.length / 2);
  const unique = new Map<string, TeamPartition>();

  for (const selected of combinations(sortedIds, targetSize)) {
    const selectedSet = new Set(selected);
    const other = sortedIds.filter((playerId) => !selectedSet.has(playerId));
    const canonical = canonicalizePartition(selected, other);
    unique.set(canonical.canonicalKey, {
      teamA: canonical.teamA,
      teamB: canonical.teamB,
    });
  }

  return [...unique.entries()]
    .sort(([left], [right]) => compareStrings(left, right))
    .map(([, partition]) => partition);
}

export function selectBestCandidate(
  candidates: ScoredTeamPartition[],
): ScoredTeamPartition {
  if (candidates.length === 0) {
    throw new Error('At least one complete candidate is required.');
  }

  const bestBalanceScore = Math.min(
    ...candidates.map(({ balanceScore }) => balanceScore),
  );
  const tolerance = calculateBalanceTolerance(bestBalanceScore);
  const acceptable = candidates.filter(
    ({ balanceScore }) => balanceScore <= tolerance,
  );
  const sorted = acceptable.sort((left, right) => {
    const historyDifference = left.historyScore - right.historyScore;

    if (Math.abs(historyDifference) > SCORE_COMPARISON_EPSILON) {
      return historyDifference;
    }

    const balanceDifference = left.balanceScore - right.balanceScore;

    if (Math.abs(balanceDifference) > SCORE_COMPARISON_EPSILON) {
      return balanceDifference;
    }

    return comparePartitions(left, right);
  });
  const best = sorted[0];

  if (!best) {
    throw new Error('No candidate remained inside the balance tolerance.');
  }

  return best;
}

function partialBalanceScore(
  teamA: RatedPlayer[],
  teamB: RatedPlayer[],
): number {
  if (teamA.length === 0 || teamB.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  return calculateBalanceBreakdown(teamA, teamB).balanceScore;
}

function currentTeamRating(team: RatedPlayer[]): number {
  if (team.length === 0) {
    return 0;
  }

  return team.reduce((sum, player) => sum + player.rating, 0) / team.length;
}

export function createGreedyPartition(players: RatedPlayer[]): TeamPartition {
  const sortedPlayers = [...players].sort(
    (left, right) =>
      right.rating - left.rating || compareStrings(left.id, right.id),
  );
  const targetA = Math.ceil(players.length / 2);
  const targetB = Math.floor(players.length / 2);
  const teamA: RatedPlayer[] = [];
  const teamB: RatedPlayer[] = [];

  for (const player of sortedPlayers) {
    const choices: Array<{
      side: 'A' | 'B';
      score: number;
      currentRating: number;
    }> = [];

    if (teamA.length < targetA) {
      choices.push({
        side: 'A',
        score: partialBalanceScore([...teamA, player], teamB),
        currentRating: currentTeamRating(teamA),
      });
    }

    if (teamB.length < targetB) {
      choices.push({
        side: 'B',
        score: partialBalanceScore(teamA, [...teamB, player]),
        currentRating: currentTeamRating(teamB),
      });
    }

    choices.sort(
      (left, right) =>
        left.score - right.score ||
        left.currentRating - right.currentRating ||
        compareStrings(left.side, right.side),
    );
    const choice = choices[0];

    if (!choice) {
      throw new Error(
        'Greedy construction has no team with remaining capacity.',
      );
    }

    if (choice.side === 'A') {
      teamA.push(player);
    } else {
      teamB.push(player);
    }
  }

  const canonical = canonicalizePartition(
    teamA.map(({ id }) => id),
    teamB.map(({ id }) => id),
  );
  return { teamA: canonical.teamA, teamB: canonical.teamB };
}

export function enumeratePairwiseSwaps(
  partition: TeamPartition,
): TeamPartition[] {
  const unique = new Map<string, TeamPartition>();

  for (const playerA of partition.teamA) {
    for (const playerB of partition.teamB) {
      const nextA = partition.teamA.map((playerId) =>
        playerId === playerA ? playerB : playerId,
      );
      const nextB = partition.teamB.map((playerId) =>
        playerId === playerB ? playerA : playerId,
      );
      const canonical = canonicalizePartition(nextA, nextB);
      unique.set(canonical.canonicalKey, {
        teamA: canonical.teamA,
        teamB: canonical.teamB,
      });
    }
  }

  return [...unique.values()];
}

export const EXHAUSTIVE_THRESHOLD =
  AlgorithmConfigV1.search.exhaustiveThreshold;
