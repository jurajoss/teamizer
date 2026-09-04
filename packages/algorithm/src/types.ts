export type PlayerAttributes = {
  speed: number;
  endurance: number;
  defense: number;
  attack: number;
  technique: number;
};

export type NormalizedPlayerAttributes = PlayerAttributes;

export type MatchOutcome = -1 | 0 | 1;

export type ReferencePlayer = {
  id: string;
  attributes: PlayerAttributes;
  statistics: {
    matches: number;
    wins: number;
    goals: number;
    recentOutcomes: MatchOutcome[];
  };
};

export type RatedPlayer = {
  id: string;
  rating: number;
  normalizedAttributes: NormalizedPlayerAttributes;
};

export type HistoricalMatch = {
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
};

export type TeamGenerationInput = {
  participantIds: string[];
  referencePlayers: ReferencePlayer[];
  history: HistoricalMatch[];
};

export type TeamProfile = {
  rating: number;
  attributes: NormalizedPlayerAttributes;
};

export type TeamPartition = {
  teamA: string[];
  teamB: string[];
};

export type TeamGenerationBreakdown = {
  strengthDifference: number;
  attributeDifference: number;
  repeatedTeamPenalty: number;
  repeatedTeammatePenalty: number;
  compositionSimilarityPenalty: number;
};

export type TeamGenerationResult = TeamPartition & {
  balanceScore: number;
  historyScore: number;
  breakdown: TeamGenerationBreakdown;
  algorithmVersion: string;
  configurationVersion: string;
};

export type ScoredTeamPartition = TeamPartition & {
  balanceScore: number;
  historyScore: number;
  breakdown: TeamGenerationBreakdown;
  canonicalKey: string;
};
