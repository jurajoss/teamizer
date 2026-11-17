import type { PlayerMatchHistoryItem } from '../api/contracts';
import { MatchListRow } from '../matches/match-list-row';
import { matchListTeamPlayers } from '../matches/matches-index-model';

export function PlayerHistoryMatchRow({
  language,
  match,
  mode,
  viewportWidth,
  onOpen,
}: {
  language: 'cs' | 'en';
  match: PlayerMatchHistoryItem;
  mode: 'phone' | 'tablet';
  viewportWidth: number;
  onOpen(): void;
}) {
  return (
    <MatchListRow
      attendance={null}
      kind="finished"
      language={language}
      mode={mode}
      personalGoals={match.subjectGoals}
      players={matchListTeamPlayers(match.teams)}
      result={match.subjectResult}
      score={match.score}
      startsAt={match.startsAt}
      viewportWidth={viewportWidth}
      onOpen={onOpen}
    />
  );
}
