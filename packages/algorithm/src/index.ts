export {
  ALGORITHM_VERSION,
  AlgorithmConfigV1,
  CONFIGURATION_VERSION,
  SCORE_COMPARISON_EPSILON,
  validateAlgorithmConfig,
} from './config.js';
export {
  EXHAUSTIVE_THRESHOLD,
  canonicalizePartition,
  createGreedyPartition,
  enumeratePairwiseSwaps,
  enumerateUniquePartitions,
  selectBestCandidate,
} from './candidates.js';
export { generateTeams } from './generate.js';
export {
  calculateAdjustedWinRate,
  calculateAttributeRating,
  calculateGroupGoalsPerMatch,
  calculatePerformance,
  calculatePlayerRating,
  calculateRecentForm,
  calculateSmoothedGoalsPerMatch,
  normalizeAttribute,
  normalizeAttributes,
  normalizeGoalsPerMatch,
  percentile,
  rateReferencePlayers,
} from './rating.js';
export {
  calculateBalanceBreakdown,
  calculateBalanceTolerance,
  calculateCompositionSimilarityPenalty,
  calculateHistoryBreakdown,
  calculateRepeatedTeamPenalty,
  calculateRepeatedTeammatePenalty,
  createTeamProfile,
  scorePartition,
} from './scoring.js';
export type {
  HistoricalMatch,
  MatchOutcome,
  NormalizedPlayerAttributes,
  PlayerAttributes,
  RatedPlayer,
  ReferencePlayer,
  ScoredTeamPartition,
  TeamGenerationBreakdown,
  TeamGenerationInput,
  TeamGenerationResult,
  TeamPartition,
  TeamProfile,
} from './types.js';
