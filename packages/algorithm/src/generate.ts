import {
  ALGORITHM_VERSION,
  AlgorithmConfigV1,
  CONFIGURATION_VERSION,
} from './config.js';
import {
  canonicalizePartition,
  createGreedyPartition,
  enumeratePairwiseSwaps,
  enumerateUniquePartitions,
  selectBestCandidate,
} from './candidates.js';
import { rateReferencePlayers } from './rating.js';
import { scorePartition } from './scoring.js';
import type {
  HistoricalMatch,
  RatedPlayer,
  ScoredTeamPartition,
  TeamGenerationInput,
  TeamGenerationResult,
  TeamPartition,
} from './types.js';

function score(
  partition: TeamPartition,
  playersById: ReadonlyMap<string, RatedPlayer>,
  history: HistoricalMatch[],
): ScoredTeamPartition {
  const canonical = canonicalizePartition(partition.teamA, partition.teamB);
  return scorePartition(
    { teamA: canonical.teamA, teamB: canonical.teamB },
    playersById,
    history,
    canonical.canonicalKey,
  );
}

function exhaustiveSearch(
  participantIds: string[],
  playersById: ReadonlyMap<string, RatedPlayer>,
  history: HistoricalMatch[],
): ScoredTeamPartition {
  return selectBestCandidate(
    enumerateUniquePartitions(participantIds).map((partition) =>
      score(partition, playersById, history),
    ),
  );
}

function heuristicSearch(
  players: RatedPlayer[],
  playersById: ReadonlyMap<string, RatedPlayer>,
  history: HistoricalMatch[],
): ScoredTeamPartition {
  let current = score(createGreedyPartition(players), playersById, history);

  for (
    let iteration = 0;
    iteration < AlgorithmConfigV1.search.heuristicMaxIterations;
    iteration += 1
  ) {
    const swaps = enumeratePairwiseSwaps(current).map((partition) =>
      score(partition, playersById, history),
    );
    const best = selectBestCandidate([current, ...swaps]);

    if (best.canonicalKey === current.canonicalKey) {
      break;
    }

    current = best;
  }

  return current;
}

function validateInput(input: TeamGenerationInput): void {
  if (input.participantIds.length < 2) {
    throw new Error('At least two participants are required.');
  }

  if (new Set(input.participantIds).size !== input.participantIds.length) {
    throw new Error('Participant IDs must be unique.');
  }

  if (
    new Set(input.referencePlayers.map(({ id }) => id)).size !==
    input.referencePlayers.length
  ) {
    throw new Error('Reference Player IDs must be unique.');
  }
}

export function generateTeams(
  input: TeamGenerationInput,
): TeamGenerationResult {
  validateInput(input);
  const ratedReferencePlayers = rateReferencePlayers(input.referencePlayers);
  const playersById = new Map(
    ratedReferencePlayers.map((player) => [player.id, player]),
  );
  const participants = input.participantIds.map((playerId) => {
    const player = playersById.get(playerId);

    if (!player) {
      throw new Error(
        `Participant ${playerId} is not in the reference population.`,
      );
    }

    return player;
  });
  const selected =
    participants.length <= AlgorithmConfigV1.search.exhaustiveThreshold
      ? exhaustiveSearch(input.participantIds, playersById, input.history)
      : heuristicSearch(participants, playersById, input.history);

  return {
    teamA: selected.teamA,
    teamB: selected.teamB,
    balanceScore: selected.balanceScore,
    historyScore: selected.historyScore,
    breakdown: selected.breakdown,
    algorithmVersion: ALGORITHM_VERSION,
    configurationVersion: CONFIGURATION_VERSION,
  };
}
