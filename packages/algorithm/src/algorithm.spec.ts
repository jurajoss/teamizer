import {
  AlgorithmConfigV1,
  calculateAdjustedWinRate,
  calculateAttributeRating,
  calculateBalanceBreakdown,
  calculateBalanceTolerance,
  calculateCompositionSimilarityPenalty,
  calculateGroupGoalsPerMatch,
  calculateHistoryBreakdown,
  calculatePerformance,
  calculatePlayerRating,
  calculateRecentForm,
  calculateRepeatedTeamPenalty,
  calculateRepeatedTeammatePenalty,
  calculateSmoothedGoalsPerMatch,
  canonicalizePartition,
  createGreedyPartition,
  createTeamProfile,
  enumeratePairwiseSwaps,
  enumerateUniquePartitions,
  generateTeams,
  normalizeAttribute,
  normalizeAttributes,
  normalizeGoalsPerMatch,
  percentile,
  rateReferencePlayers,
  scorePartition,
  selectBestCandidate,
  validateAlgorithmConfig,
} from './index.js';
import type {
  HistoricalMatch,
  RatedPlayer,
  ReferencePlayer,
  ScoredTeamPartition,
  TeamGenerationInput,
} from './index.js';
import { describe, expect, it } from 'vitest';

const middleAttributes = {
  speed: 5,
  endurance: 5,
  defense: 5,
  attack: 5,
  technique: 5,
};

function referencePlayer(
  id: string,
  overrides: Partial<ReferencePlayer> = {},
): ReferencePlayer {
  return {
    id,
    attributes: middleAttributes,
    statistics: { matches: 0, wins: 0, goals: 0, recentOutcomes: [] },
    ...overrides,
  };
}

function inputFor(playerCount: number): TeamGenerationInput {
  const referencePlayers = Array.from({ length: playerCount }, (_, index) =>
    referencePlayer(`player-${String(index + 1).padStart(2, '0')}`, {
      attributes: {
        speed: (index % 10) + 1,
        endurance: ((index + 2) % 10) + 1,
        defense: ((index + 4) % 10) + 1,
        attack: ((index + 6) % 10) + 1,
        technique: ((index + 8) % 10) + 1,
      },
      statistics: {
        matches: index,
        wins: Math.floor(index / 2),
        goals: index * 2,
        recentOutcomes: index === 0 ? [] : [1, 0, -1],
      },
    }),
  );

  return {
    participantIds: referencePlayers.map(({ id }) => id),
    referencePlayers,
    history: [],
  };
}

function ratedPlayer(id: string, rating: number): RatedPlayer {
  return {
    id,
    rating,
    normalizedAttributes: {
      speed: rating,
      endurance: rating,
      defense: rating,
      attack: rating,
      technique: rating,
    },
  };
}

function candidate(
  canonicalKey: string,
  balanceScore: number,
  historyScore: number,
): ScoredTeamPartition {
  return {
    teamA: ['a'],
    teamB: ['b'],
    balanceScore,
    historyScore,
    canonicalKey,
    breakdown: {
      strengthDifference: balanceScore,
      attributeDifference: 0,
      repeatedTeamPenalty: 0,
      repeatedTeammatePenalty: 0,
      compositionSimilarityPenalty: 0,
    },
  };
}

describe('AlgorithmConfigV1', () => {
  it('matches and validates the approved versioned configuration', () => {
    expect(() => validateAlgorithmConfig()).not.toThrow();
    expect(AlgorithmConfigV1.search).toEqual({
      exhaustiveThreshold: 14,
      heuristicMaxIterations: 100,
    });
  });
});

describe('player rating', () => {
  it('smooths adjusted win rate toward 0.5', () => {
    expect(calculateAdjustedWinRate(0, 0)).toBe(0.5);
    expect(calculateAdjustedWinRate(7, 10)).toBe(0.625);
  });

  it('calculates the group baseline from played Player-match appearances', () => {
    const players = [
      referencePlayer('a', {
        statistics: { matches: 2, wins: 1, goals: 4, recentOutcomes: [] },
      }),
      referencePlayer('b'),
    ];

    expect(calculateGroupGoalsPerMatch(players)).toBe(2);
    expect(calculateGroupGoalsPerMatch([referencePlayer('zero')])).toBe(0);
  });

  it('smooths goals per match with five group-baseline matches', () => {
    expect(calculateSmoothedGoalsPerMatch(4, 2, 2)).toBe(2);
    expect(calculateSmoothedGoalsPerMatch(0, 0, 0)).toBe(0);
  });

  it('uses linear interpolation for empirical percentiles', () => {
    expect(percentile([20, 0, 10], 0.1)).toBe(2);
    expect(percentile([20, 0, 10], 0.9)).toBe(18);
  });

  it('normalizes smoothed goals between p10 and p90 with clamping', () => {
    expect(normalizeGoalsPerMatch(2, 2, 18)).toBe(0);
    expect(normalizeGoalsPerMatch(10, 2, 18)).toBe(0.5);
    expect(normalizeGoalsPerMatch(20, 2, 18)).toBe(1);
    expect(normalizeGoalsPerMatch(4, 4, 4)).toBe(0.5);
  });

  it('normalizes and weights all five attributes', () => {
    expect(normalizeAttribute(1)).toBe(0);
    expect(normalizeAttribute(10)).toBe(1);
    const normalized = normalizeAttributes({
      speed: 10,
      endurance: 1,
      defense: 10,
      attack: 1,
      technique: 10,
    });
    expect(normalized).toEqual({
      speed: 1,
      endurance: 0,
      defense: 1,
      attack: 0,
      technique: 1,
    });
    expect(calculateAttributeRating(normalized)).toBeCloseTo(0.6);
  });

  it('renormalizes available recent-form weights', () => {
    expect(calculateRecentForm([])).toBe(0.5);
    expect(calculateRecentForm([1, -1])).toBeCloseTo(0.6153846154);
  });

  it('combines performance and total player rating with approved weights', () => {
    expect(calculatePerformance(0.5, 1)).toBe(0.625);
    expect(calculatePlayerRating(0.625, 0.6, 0.5)).toBeCloseTo(0.605);
  });

  it('assigns normalized goals 0.5 with fewer than two reference Players', () => {
    const [rated] = rateReferencePlayers([referencePlayer('only')]);

    expect(rated?.rating).toBeCloseTo(0.4833333333);
  });

  it('handles zero-match reference Players in p10/p90 normalization', () => {
    const rated = rateReferencePlayers([
      referencePlayer('zero'),
      referencePlayer('played', {
        statistics: { matches: 5, wins: 4, goals: 10, recentOutcomes: [1] },
      }),
    ]);

    expect(rated).toHaveLength(2);
    expect(rated.every(({ rating }) => rating >= 0 && rating <= 1)).toBe(true);
  });
});

describe('team and history scoring', () => {
  it('averages ratings and normalized attributes into a team profile', () => {
    const profile = createTeamProfile([
      ratedPlayer('low', 0),
      ratedPlayer('high', 1),
    ]);

    expect(profile.rating).toBe(0.5);
    expect(profile.attributes).toEqual({
      speed: 0.5,
      endurance: 0.5,
      defense: 0.5,
      attack: 0.5,
      technique: 0.5,
    });
  });

  it('calculates exact balance score and zero balance', () => {
    const same = calculateBalanceBreakdown(
      [ratedPlayer('a', 0.5)],
      [ratedPlayer('b', 0.5)],
    );
    const opposite = calculateBalanceBreakdown(
      [ratedPlayer('low', 0)],
      [ratedPlayer('high', 1)],
    );

    expect(same.balanceScore).toBe(0);
    expect(opposite).toEqual({
      strengthDifference: 1,
      attributeDifference: 1,
      balanceScore: 1,
    });
  });

  it('calculates the approved relative-or-absolute tolerance', () => {
    expect(calculateBalanceTolerance(0)).toBe(0.001);
    expect(calculateBalanceTolerance(1)).toBe(1.05);
  });

  it('calculates repeated team, teammate, and composition penalties', () => {
    const partition = { teamA: ['a', 'b'], teamB: ['c', 'd'] };
    const repeated: HistoricalMatch[] = [
      { teamAPlayerIds: ['a', 'b'], teamBPlayerIds: ['c', 'd'] },
    ];
    const crossed: HistoricalMatch[] = [
      { teamAPlayerIds: ['a', 'c'], teamBPlayerIds: ['b', 'd'] },
    ];

    expect(calculateRepeatedTeamPenalty(partition, repeated)).toBe(1);
    expect(calculateRepeatedTeammatePenalty(partition, repeated)).toBe(1);
    expect(calculateCompositionSimilarityPenalty(partition, repeated)).toBe(1);
    expect(calculateRepeatedTeamPenalty(partition, crossed)).toBe(0);
    expect(calculateRepeatedTeammatePenalty(partition, crossed)).toBe(0);
    expect(calculateCompositionSimilarityPenalty(partition, crossed)).toBe(0.5);
    expect(calculateHistoryBreakdown(partition, crossed).historyScore).toBe(
      0.075,
    );
  });

  it('returns zero history penalties with no history', () => {
    expect(
      calculateHistoryBreakdown({ teamA: ['a'], teamB: ['b'] }, []),
    ).toEqual({
      repeatedTeamPenalty: 0,
      repeatedTeammatePenalty: 0,
      compositionSimilarityPenalty: 0,
      historyScore: 0,
    });
  });

  it('uses history first only among balance-tolerant candidates', () => {
    const bestBalance = candidate('b', 0, 0.5);
    const historyChoice = candidate('c', 0.0009, 0);
    const outsideTolerance = candidate('a', 0.002, -1);

    expect(
      selectBestCandidate([bestBalance, outsideTolerance, historyChoice])
        .canonicalKey,
    ).toBe('c');
  });
});

describe('candidate search and generation', () => {
  it('canonicalizes mirrored teams to the same representation', () => {
    expect(canonicalizePartition(['b', 'a'], ['d', 'c'])).toEqual(
      canonicalizePartition(['c', 'd'], ['a', 'b']),
    );
  });

  it('enumerates each mirrored partition once', () => {
    expect(enumerateUniquePartitions(['a', 'b'])).toHaveLength(1);
    expect(enumerateUniquePartitions(['a', 'b', 'c'])).toHaveLength(3);
    expect(enumerateUniquePartitions(['a', 'b', 'c', 'd'])).toHaveLength(3);
    expect(
      enumerateUniquePartitions(
        Array.from({ length: 14 }, (_, index) => `p${index}`),
      ),
    ).toHaveLength(1716);
  });

  it('uses deterministic lexicographic tie-breaking', () => {
    const equalPlayers = ['d', 'c', 'b', 'a'].map((id) => referencePlayer(id));
    const result = generateTeams({
      participantIds: equalPlayers.map(({ id }) => id),
      referencePlayers: equalPlayers,
      history: [],
    });

    expect(result.teamA).toEqual(['a', 'b']);
    expect(result.teamB).toEqual(['c', 'd']);
  });

  it('handles two participants and odd participant counts', () => {
    const two = generateTeams(inputFor(2));
    const odd = generateTeams(inputFor(5));

    expect([...two.teamA, ...two.teamB]).toHaveLength(2);
    expect(two.teamA).toHaveLength(1);
    expect(two.teamB).toHaveLength(1);
    expect(Math.abs(odd.teamA.length - odd.teamB.length)).toBe(1);
  });

  it('uses exhaustive generation through 14 participants', () => {
    const result = generateTeams(inputFor(14));

    expect([...result.teamA, ...result.teamB]).toHaveLength(14);
    expect(result.algorithmVersion).toBe('v1');
    expect(result.configurationVersion).toBe('v1');
  });

  it('builds the approved greedy seed and legal pairwise swaps', () => {
    const players = [
      ratedPlayer('a', 1),
      ratedPlayer('b', 0.9),
      ratedPlayer('c', 0.2),
      ratedPlayer('d', 0.1),
    ];
    const greedy = createGreedyPartition(players);
    const swaps = enumeratePairwiseSwaps(greedy);

    expect(greedy.teamA).toHaveLength(2);
    expect(greedy.teamB).toHaveLength(2);
    expect(swaps).toHaveLength(2);
    expect(
      swaps.every(
        ({ teamA, teamB }) => teamA.length === 2 && teamB.length === 2,
      ),
    ).toBe(true);
  });

  it('uses deterministic heuristic fallback above 14 participants', () => {
    const input = inputFor(15);
    const first = generateTeams(input);
    const second = generateTeams(input);

    expect(first).toEqual(second);
    expect([...first.teamA, ...first.teamB]).toHaveLength(15);
    expect(Math.abs(first.teamA.length - first.teamB.length)).toBe(1);
  });

  it('applies pairwise local improvement to the heuristic seed', () => {
    const referencePlayers = Array.from({ length: 15 }, (_, index) => {
      const attributeSeed = index + 1;
      const matches = index % 13;

      return referencePlayer(`p${String(index + 1).padStart(2, '0')}`, {
        attributes: {
          speed: (attributeSeed % 10) + 1,
          endurance: ((attributeSeed * 3) % 10) + 1,
          defense: ((attributeSeed * 5) % 10) + 1,
          attack: ((attributeSeed * 7) % 10) + 1,
          technique: ((attributeSeed * 9) % 10) + 1,
        },
        statistics: {
          matches,
          wins: Math.min((index + 1) % 7, matches),
          goals: (index * 3) % 29,
          recentOutcomes: index % 3 === 0 ? [1, 0, -1] : [-1, 1],
        },
      });
    });
    const ratedPlayers = rateReferencePlayers(referencePlayers);
    const playersById = new Map(
      ratedPlayers.map((player) => [player.id, player]),
    );
    const greedy = createGreedyPartition(ratedPlayers);
    const canonicalGreedy = canonicalizePartition(greedy.teamA, greedy.teamB);
    const greedyScore = scorePartition(
      greedy,
      playersById,
      [],
      canonicalGreedy.canonicalKey,
    ).balanceScore;
    const improved = generateTeams({
      participantIds: referencePlayers.map(({ id }) => id),
      referencePlayers,
      history: [],
    });

    expect(improved.balanceScore).toBeLessThan(greedyScore);
  });

  it('is deterministic across repeated exhaustive executions', () => {
    const input = inputFor(8);
    const expected = generateTeams(input);

    for (let iteration = 0; iteration < 5; iteration += 1) {
      expect(generateTeams(input)).toEqual(expected);
    }
  });
});
