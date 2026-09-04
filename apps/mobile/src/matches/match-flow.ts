import type {
  MatchDetail,
  TeamProposal,
  UpcomingMatch,
} from '../api/contracts';

export type ParticipantGroup = keyof MatchDetail['participants'];

export type TransientTeamProposal = {
  matchStateVersion: number;
  generatedTeamAPlayerIds: string[];
  generatedTeamBPlayerIds: string[];
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
  balance: TeamProposal['balance'];
  algorithmVersion: string;
  configurationVersion: string;
  proposalReceipt: string;
};

export type ProposalValidation =
  { valid: true } | { valid: false; reason: string };

const staleProposalConflictCodes = new Set([
  'CONCURRENT_STATE_CHANGE',
  'PROPOSAL_RECEIPT_INVALID',
  'MATCH_NOT_OPEN',
  'MATCH_CANCELLED',
]);

export function primaryUpcomingMatch(
  matches: UpcomingMatch[],
): UpcomingMatch | null {
  return (
    matches.find(({ status }) => status === 'IN_PROGRESS') ?? matches[0] ?? null
  );
}

export function matchRouteFor(matchId: string): `/matches/${string}` {
  return `/matches/${matchId}`;
}

export function formatMatchDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: 'Europe/Prague',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function validateParticipantGroups(match: MatchDetail):
  | {
      valid: true;
      playersById: Map<string, MatchDetail['participants']['going'][number]>;
    }
  | { valid: false; reason: string } {
  const playersById = new Map<
    string,
    MatchDetail['participants']['going'][number]
  >();

  for (const group of ['going', 'notGoing', 'unanswered'] as const) {
    for (const player of match.participants[group]) {
      if (playersById.has(player.id)) {
        return {
          valid: false,
          reason:
            'Participant data is inconsistent. Refresh the Match before making changes.',
        };
      }
      playersById.set(player.id, player);
    }
  }

  return { valid: true, playersById };
}

export function createTransientProposal(
  match: MatchDetail,
  response: TeamProposal,
): TransientTeamProposal {
  const proposal: TransientTeamProposal = {
    matchStateVersion: match.stateVersion,
    generatedTeamAPlayerIds: [...response.teamAPlayerIds],
    generatedTeamBPlayerIds: [...response.teamBPlayerIds],
    teamAPlayerIds: [...response.teamAPlayerIds],
    teamBPlayerIds: [...response.teamBPlayerIds],
    balance: response.balance,
    algorithmVersion: response.algorithmVersion,
    configurationVersion: response.configurationVersion,
    proposalReceipt: response.proposalReceipt,
  };
  const validation = validateProposal(match, proposal);

  if (!validation.valid) {
    throw new Error(validation.reason);
  }

  return proposal;
}

export function validateProposal(
  match: MatchDetail,
  proposal: TransientTeamProposal,
): ProposalValidation {
  if (match.status !== 'OPEN_FOR_REGISTRATION') {
    return { valid: false, reason: 'The Match is no longer open.' };
  }
  if (proposal.matchStateVersion !== match.stateVersion) {
    return {
      valid: false,
      reason: 'Attendance changed after team generation.',
    };
  }
  if (
    proposal.teamAPlayerIds.length === 0 ||
    proposal.teamBPlayerIds.length === 0
  ) {
    return { valid: false, reason: 'Both teams must contain a player.' };
  }
  if (
    Math.abs(proposal.teamAPlayerIds.length - proposal.teamBPlayerIds.length) >
    1
  ) {
    return { valid: false, reason: 'Team sizes may differ by at most one.' };
  }

  const assigned = [...proposal.teamAPlayerIds, ...proposal.teamBPlayerIds];
  const assignedSet = new Set(assigned);
  const goingIds = match.participants.going.map(({ id }) => id).sort();
  const assignedIds = [...assignedSet].sort();

  if (assignedSet.size !== assigned.length) {
    return { valid: false, reason: 'A player appears in both teams.' };
  }
  if (
    assignedIds.length !== goingIds.length ||
    assignedIds.some((id, index) => id !== goingIds[index])
  ) {
    return {
      valid: false,
      reason: 'Every going player must appear exactly once.',
    };
  }

  return { valid: true };
}

export function reconcileProposal(
  proposal: TransientTeamProposal | null,
  match: MatchDetail,
): TransientTeamProposal | null {
  if (!proposal) {
    return null;
  }

  return validateProposal(match, proposal).valid ? proposal : null;
}

export function isStaleProposalConflict(error: {
  status: number;
  code: string;
}): boolean {
  return error.status === 409 && staleProposalConflictCodes.has(error.code);
}

export function canSubmitStart(
  match: MatchDetail,
  proposal: TransientTeamProposal | null,
  busy: boolean,
): boolean {
  return !busy && proposal !== null && validateProposal(match, proposal).valid;
}

export function canMovePlayer(
  proposal: TransientTeamProposal,
  playerId: string,
): boolean {
  const source = proposal.teamAPlayerIds.includes(playerId)
    ? proposal.teamAPlayerIds
    : proposal.teamBPlayerIds.includes(playerId)
      ? proposal.teamBPlayerIds
      : null;
  const target =
    source === proposal.teamAPlayerIds
      ? proposal.teamBPlayerIds
      : proposal.teamAPlayerIds;

  return (
    source !== null &&
    source.length > 1 &&
    Math.abs(source.length - 1 - (target.length + 1)) <= 1
  );
}

export function movePlayer(
  proposal: TransientTeamProposal,
  playerId: string,
): TransientTeamProposal {
  if (!canMovePlayer(proposal, playerId)) {
    return proposal;
  }

  const fromA = proposal.teamAPlayerIds.includes(playerId);
  return {
    ...proposal,
    teamAPlayerIds: fromA
      ? proposal.teamAPlayerIds.filter((id) => id !== playerId)
      : [...proposal.teamAPlayerIds, playerId],
    teamBPlayerIds: fromA
      ? [...proposal.teamBPlayerIds, playerId]
      : proposal.teamBPlayerIds.filter((id) => id !== playerId),
  };
}

export function swapPlayers(
  proposal: TransientTeamProposal,
  firstPlayerId: string,
  secondPlayerId: string,
): TransientTeamProposal {
  const firstInA = proposal.teamAPlayerIds.includes(firstPlayerId);
  const secondInA = proposal.teamAPlayerIds.includes(secondPlayerId);

  if (
    firstPlayerId === secondPlayerId ||
    firstInA === secondInA ||
    (!firstInA && !proposal.teamBPlayerIds.includes(firstPlayerId)) ||
    (!secondInA && !proposal.teamBPlayerIds.includes(secondPlayerId))
  ) {
    return proposal;
  }

  return {
    ...proposal,
    teamAPlayerIds: proposal.teamAPlayerIds.map((id) =>
      id === firstPlayerId
        ? secondPlayerId
        : id === secondPlayerId
          ? firstPlayerId
          : id,
    ),
    teamBPlayerIds: proposal.teamBPlayerIds.map((id) =>
      id === firstPlayerId
        ? secondPlayerId
        : id === secondPlayerId
          ? firstPlayerId
          : id,
    ),
  };
}

export function proposalWasAdjusted(proposal: TransientTeamProposal): boolean {
  return (
    canonicalPartitionKey(proposal.teamAPlayerIds, proposal.teamBPlayerIds) !==
    canonicalPartitionKey(
      proposal.generatedTeamAPlayerIds,
      proposal.generatedTeamBPlayerIds,
    )
  );
}

export function canShowAdminMatchControls(
  role: 'PLAYER' | 'ADMIN',
  matchStatus: MatchDetail['status'],
): boolean {
  return role === 'ADMIN' && matchStatus === 'OPEN_FOR_REGISTRATION';
}

export function isMatchReadOnly(status: MatchDetail['status']): boolean {
  return status !== 'OPEN_FOR_REGISTRATION';
}

function canonicalPartitionKey(teamA: string[], teamB: string[]): string {
  const first = [...teamA].sort().join(',');
  const second = [...teamB].sort().join(',');
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}
