export const AlgorithmConfigV1 = {
  playerRating: {
    performanceWeight: 0.6,
    attributesWeight: 0.3,
    recentFormWeight: 0.1,
  },
  performance: {
    winRateWeight: 0.75,
    goalsPerMatchWeight: 0.25,
    winRatePriorWins: 3,
    winRatePriorMatches: 6,
    goalsPerMatchPriorMatches: 5,
  },
  attributes: {
    speed: 0.2,
    endurance: 0.15,
    defense: 0.25,
    attack: 0.25,
    technique: 0.15,
  },
  recentForm: {
    matchWeights: [0.4, 0.25, 0.15, 0.12, 0.08],
  },
  balance: {
    overallStrengthWeight: 0.7,
    attributeDifferenceWeight: 0.3,
    relativeTolerance: 0.05,
    absoluteTolerance: 0.001,
  },
  history: {
    repeatedTeamWeight: 0.5,
    repeatedTeammateWeight: 0.35,
    compositionSimilarityWeight: 0.15,
    recencyDecay: [1, 0.6, 0.35, 0.2, 0.1],
  },
  search: {
    exhaustiveThreshold: 14,
    heuristicMaxIterations: 100,
  },
} as const;

export const ALGORITHM_VERSION = 'v1';
export const CONFIGURATION_VERSION = 'v1';
export const SCORE_COMPARISON_EPSILON = 1e-9;

type WeightGroup = Record<string, number>;

function assertWeightGroup(name: string, weights: WeightGroup): void {
  const values = Object.values(weights);

  if (values.some((value) => value < 0)) {
    throw new Error(`${name} weights must be non-negative.`);
  }

  const total = values.reduce((sum, value) => sum + value, 0);

  if (Math.abs(total - 1) > SCORE_COMPARISON_EPSILON) {
    throw new Error(`${name} weights must sum to 1.`);
  }
}

export function validateAlgorithmConfig(): void {
  assertWeightGroup('playerRating', AlgorithmConfigV1.playerRating);
  assertWeightGroup('performance', {
    winRateWeight: AlgorithmConfigV1.performance.winRateWeight,
    goalsPerMatchWeight: AlgorithmConfigV1.performance.goalsPerMatchWeight,
  });
  assertWeightGroup('attributes', AlgorithmConfigV1.attributes);
  assertWeightGroup('balance', {
    overallStrengthWeight: AlgorithmConfigV1.balance.overallStrengthWeight,
    attributeDifferenceWeight:
      AlgorithmConfigV1.balance.attributeDifferenceWeight,
  });
  assertWeightGroup('history', {
    repeatedTeamWeight: AlgorithmConfigV1.history.repeatedTeamWeight,
    repeatedTeammateWeight: AlgorithmConfigV1.history.repeatedTeammateWeight,
    compositionSimilarityWeight:
      AlgorithmConfigV1.history.compositionSimilarityWeight,
  });
  assertWeightGroup(
    'recentForm',
    Object.fromEntries(
      AlgorithmConfigV1.recentForm.matchWeights.map((weight, index) => [
        String(index),
        weight,
      ]),
    ),
  );

  if (
    AlgorithmConfigV1.recentForm.matchWeights.length !== 5 ||
    AlgorithmConfigV1.history.recencyDecay.length !== 5
  ) {
    throw new Error('V1 recent-form and history vectors must have 5 entries.');
  }

  if (
    AlgorithmConfigV1.search.exhaustiveThreshold !== 14 ||
    AlgorithmConfigV1.search.heuristicMaxIterations !== 100
  ) {
    throw new Error(
      'V1 search limits do not match the approved configuration.',
    );
  }
}

validateAlgorithmConfig();
