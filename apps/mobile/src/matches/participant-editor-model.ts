import type { AuthenticatedApiClient } from '../api/authenticated-api-client';
import type { Attendance, MatchDetail, PlayersPage } from '../api/contracts';

export type ParticipantAttendanceState = Attendance | null;
export type ParticipantEditorPlayer = PlayersPage['items'][number] & {
  attendance: ParticipantAttendanceState;
};

export type ParticipantEditorGroups = {
  going: ParticipantEditorPlayer[];
  notGoing: ParticipantEditorPlayer[];
  unanswered: ParticipantEditorPlayer[];
};

export type ParticipantAttendanceTransition =
  | { kind: 'NONE' }
  | { kind: 'UNSUPPORTED' }
  | { kind: 'ADD_GOING' }
  | { attendance: Attendance; kind: 'UPDATE' };

type ParticipantEditorApi = Pick<
  AuthenticatedApiClient,
  'addParticipant' | 'updateParticipant'
>;

export const participantEditorPageSize = 25;

export function participantEditorSearchOptions(
  search: string,
  cursor: string | null,
): {
  cursor?: string;
  limit: number;
  q?: string;
  status: 'ACTIVE';
} {
  const query = search.trim();
  return {
    limit: participantEditorPageSize,
    status: 'ACTIVE',
    ...(query ? { q: query } : {}),
    ...(cursor ? { cursor } : {}),
  };
}

export function participantEditorGroups(
  pages: PlayersPage[] | undefined,
  match: MatchDetail,
  search: string,
): ParticipantEditorGroups {
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const players = new Map<string, PlayersPage['items'][number]>();

  for (const player of [
    ...match.participants.going,
    ...match.participants.notGoing,
  ]) {
    if (
      player.status === 'ACTIVE' &&
      player.name.toLocaleLowerCase().startsWith(normalizedSearch)
    ) {
      players.set(player.id, player);
    }
  }

  for (const player of pages?.flatMap(({ items }) => items) ?? []) {
    if (
      player.status === 'ACTIVE' &&
      player.name.toLocaleLowerCase().startsWith(normalizedSearch)
    ) {
      players.set(player.id, player);
    }
  }

  const goingIds = new Set(match.participants.going.map(({ id }) => id));
  const notGoingIds = new Set(match.participants.notGoing.map(({ id }) => id));
  const groups: ParticipantEditorGroups = {
    going: [],
    notGoing: [],
    unanswered: [],
  };

  for (const player of players.values()) {
    const attendance: ParticipantAttendanceState = goingIds.has(player.id)
      ? 'GOING'
      : notGoingIds.has(player.id)
        ? 'NOT_GOING'
        : null;
    const editorPlayer = { ...player, attendance };

    if (attendance === 'GOING') groups.going.push(editorPlayer);
    else if (attendance === 'NOT_GOING') groups.notGoing.push(editorPlayer);
    else groups.unanswered.push(editorPlayer);
  }

  for (const group of Object.values(groups)) {
    group.sort(comparePlayers);
  }

  return groups;
}

export function participantAttendanceTransition(
  current: ParticipantAttendanceState,
  next: ParticipantAttendanceState,
): ParticipantAttendanceTransition {
  if (current === next) return { kind: 'NONE' };
  if (next === null) return { kind: 'UNSUPPORTED' };
  if (current === null && next === 'GOING') return { kind: 'ADD_GOING' };
  return { attendance: next, kind: 'UPDATE' };
}

export async function updateParticipantAttendance(
  apiClient: ParticipantEditorApi,
  matchId: string,
  playerId: string,
  current: ParticipantAttendanceState,
  next: ParticipantAttendanceState,
): Promise<boolean> {
  const transition = participantAttendanceTransition(current, next);

  if (transition.kind === 'NONE') return false;
  if (transition.kind === 'UNSUPPORTED') {
    throw new Error('Returning another Player to unanswered is unsupported.');
  }
  if (transition.kind === 'ADD_GOING') {
    await apiClient.addParticipant(matchId, { playerId });
    return true;
  }

  await apiClient.updateParticipant(matchId, playerId, transition.attendance);
  return true;
}

export function canAccessParticipantEditor(
  role: 'PLAYER' | 'ADMIN',
  playerStatus: 'ACTIVE' | 'INACTIVE',
  matchStatus: MatchDetail['status'],
): boolean {
  return (
    role === 'ADMIN' &&
    playerStatus === 'ACTIVE' &&
    matchStatus === 'OPEN_FOR_REGISTRATION'
  );
}

function comparePlayers(
  left: ParticipantEditorPlayer,
  right: ParticipantEditorPlayer,
): number {
  const byName = left.name.localeCompare(right.name, undefined, {
    sensitivity: 'base',
  });
  return byName !== 0 ? byName : left.id.localeCompare(right.id);
}
