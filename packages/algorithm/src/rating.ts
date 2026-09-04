import { AlgorithmConfigV1 } from './config.js';
import type {
  MatchOutcome,
  NormalizedPlayerAttributes,
  RatedPlayer,
  ReferencePlayer,
  PlayerAttributes,
} from './types.js';

export function calculateAdjustedWinRate(
  wins: number,
  matches: number,
): number {
  return (
    (wins + AlgorithmConfigV1.performance.winRatePriorWins) /
    (matches + AlgorithmConfigV1.performance.winRatePriorMatches)
  );
}

export function calculateGroupGoalsPerMatch(
  players: ReferencePlayer[],
): number {
  const playersWithMatches = players.filter(
    ({ statistics }) => statistics.matches > 0,
  );
  const totalMatches = playersWithMatches.reduce(
    (sum, { statistics }) => sum + statistics.matches,
    0,
  );

  if (totalMatches === 0) {
    return 0;
  }

  const totalGoals = playersWithMatches.reduce(
    (sum, { statistics }) => sum + statistics.goals,
    0,
  );
  return totalGoals / totalMatches;
}

export function calculateSmoothedGoalsPerMatch(
  goals: number,
  matches: number,
  groupGoalsPerMatch: number,
): number {
  const priorMatches = AlgorithmConfigV1.performance.goalsPerMatchPriorMatches;
  return (goals + groupGoalsPerMatch * priorMatches) / (matches + priorMatches);
}

export function percentile(values: number[], probability: number): number {
  if (values.length === 0) {
    throw new Error('Cannot calculate a percentile for an empty collection.');
  }

  if (probability < 0 || probability > 1) {
    throw new Error('Percentile probability must be between 0 and 1.');
  }

  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const fraction = position - lowerIndex;
  const lower = sorted[lowerIndex];
  const upper = sorted[upperIndex];

  if (lower === undefined || upper === undefined) {
    throw new Error('Percentile index is outside the sorted collection.');
  }

  return lower * (1 - fraction) + upper * fraction;
}

export function normalizeGoalsPerMatch(
  value: number,
  p10: number,
  p90: number,
): number {
  if (p10 === p90) {
    return 0.5;
  }

  return Math.max(0, Math.min(1, (value - p10) / (p90 - p10)));
}

export function normalizeAttribute(value: number): number {
  return (value - 1) / 9;
}

export function normalizeAttributes(
  attributes: PlayerAttributes,
): NormalizedPlayerAttributes {
  return {
    speed: normalizeAttribute(attributes.speed),
    endurance: normalizeAttribute(attributes.endurance),
    defense: normalizeAttribute(attributes.defense),
    attack: normalizeAttribute(attributes.attack),
    technique: normalizeAttribute(attributes.technique),
  };
}

export function calculateAttributeRating(
  attributes: NormalizedPlayerAttributes,
): number {
  const weights = AlgorithmConfigV1.attributes;
  return (
    weights.speed * attributes.speed +
    weights.endurance * attributes.endurance +
    weights.defense * attributes.defense +
    weights.attack * attributes.attack +
    weights.technique * attributes.technique
  );
}

export function calculateRecentForm(outcomes: MatchOutcome[]): number {
  if (outcomes.length === 0) {
    return 0.5;
  }

  const recentOutcomes = outcomes.slice(
    0,
    AlgorithmConfigV1.recentForm.matchWeights.length,
  );
  const availableWeights = AlgorithmConfigV1.recentForm.matchWeights.slice(
    0,
    recentOutcomes.length,
  );
  const weightTotal = availableWeights.reduce((sum, weight) => sum + weight, 0);
  const weightedOutcome = recentOutcomes.reduce<number>(
    (sum, outcome, index) => sum + outcome * (availableWeights[index] ?? 0),
    0,
  );

  return (weightedOutcome / weightTotal + 1) / 2;
}

export function calculatePerformance(
  adjustedWinRate: number,
  normalizedGoalsPerMatch: number,
): number {
  return (
    AlgorithmConfigV1.performance.winRateWeight * adjustedWinRate +
    AlgorithmConfigV1.performance.goalsPerMatchWeight * normalizedGoalsPerMatch
  );
}

export function calculatePlayerRating(
  performance: number,
  attributeRating: number,
  recentForm: number,
): number {
  return (
    AlgorithmConfigV1.playerRating.performanceWeight * performance +
    AlgorithmConfigV1.playerRating.attributesWeight * attributeRating +
    AlgorithmConfigV1.playerRating.recentFormWeight * recentForm
  );
}

export function rateReferencePlayers(
  players: ReferencePlayer[],
): RatedPlayer[] {
  if (players.length === 0) {
    return [];
  }

  const groupGoalsPerMatch = calculateGroupGoalsPerMatch(players);
  const smoothedGoals = new Map(
    players.map((player) => [
      player.id,
      calculateSmoothedGoalsPerMatch(
        player.statistics.goals,
        player.statistics.matches,
        groupGoalsPerMatch,
      ),
    ]),
  );
  const smoothedValues = [...smoothedGoals.values()];
  const p10 = players.length < 2 ? null : percentile(smoothedValues, 0.1);
  const p90 = players.length < 2 ? null : percentile(smoothedValues, 0.9);

  return players.map((player) => {
    const normalizedAttributes = normalizeAttributes(player.attributes);
    const smoothedGoalsPerMatch = smoothedGoals.get(player.id);

    if (smoothedGoalsPerMatch === undefined) {
      throw new Error(`Missing smoothed goals for Player ${player.id}.`);
    }

    const normalizedGoals =
      p10 === null || p90 === null
        ? 0.5
        : normalizeGoalsPerMatch(smoothedGoalsPerMatch, p10, p90);
    const performance = calculatePerformance(
      calculateAdjustedWinRate(
        player.statistics.wins,
        player.statistics.matches,
      ),
      normalizedGoals,
    );

    return {
      id: player.id,
      rating: calculatePlayerRating(
        performance,
        calculateAttributeRating(normalizedAttributes),
        calculateRecentForm(player.statistics.recentOutcomes),
      ),
      normalizedAttributes,
    };
  });
}
