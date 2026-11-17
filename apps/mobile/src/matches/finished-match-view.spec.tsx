import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  StyleSheet: { create: <T,>(styles: T) => styles },
  View: 'View',
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Readonly<Record<string, unknown>>) => {
      if (key === 'common.team') return `Team ${String(options?.side)}`;
      if (key === 'common.goalCount') return `${String(options?.count)} goals`;
      return key;
    },
  }),
}));

vi.mock('@teamizer/ui', () => ({
  AppText: 'AppText',
  Avatar: 'Avatar',
  borderWidths: { subtle: 1 },
  Card: 'Card',
  FeedbackBanner: 'FeedbackBanner',
  radii: { md: 14 },
  spacing: { md: 16, sm: 12, xs: 8, xxs: 4 },
  useTheme: () => ({
    colors: {
      teamABorder: 'teamABorder',
      teamASurface: 'teamASurface',
      teamAText: 'teamAText',
      teamBBorder: 'teamBBorder',
      teamBSurface: 'teamBSurface',
      teamBText: 'teamBText',
    },
  }),
}));

vi.mock('./open-match-view', () => ({
  MatchInformation: 'MatchInformation',
}));

import type { MatchDetail } from '../api/contracts';
import { finishedMatch, ids } from '../scoring/scoring-test-fixtures';
import {
  FinishedMatchResultCard,
  FinishedMatchView,
} from './finished-match-view';
import { MatchTeamColumns } from './match-team-columns';

type TestElement = ReactElement<{
  [key: string]: unknown;
  children?: ReactNode;
}>;

describe('finished Match detail presentation', () => {
  it('renders match information before one unified result card', () => {
    const view = FinishedMatchView({ match: resultMatch() }) as TestElement;
    const children = directChildren(view);

    expect(children.map(({ type }) => type)).toEqual([
      'MatchInformation',
      FinishedMatchResultCard,
    ]);
    expect(
      children.filter(({ type }) => type === FinishedMatchResultCard),
    ).toHaveLength(1);
  });

  it('centers standalone semantic score numbers above the shared two-column rosters', () => {
    const card = FinishedMatchResultCard({
      match: resultMatch(),
    }) as TestElement;
    const [scoreRow, columns] = directChildren(card);

    expect(card.type).toBe('Card');
    expect(card.props.padding).toBe('compact');
    expect(card.props.style).toMatchObject({ gap: 12 });
    const scoreChildren = directChildren(scoreRow as TestElement);
    expect(scoreRow?.props.style).toMatchObject({ gap: 8 });
    expect(scoreChildren.map(({ type }) => type)).toEqual([
      'AppText',
      'AppText',
      'AppText',
    ]);
    expect(scoreChildren.map(({ props }) => props.children)).toEqual([
      5,
      ':',
      3,
    ]);
    expect(scoreChildren[0]?.props).toMatchObject({
      accessibilityLabel: 'Team A, 5',
      style: expect.arrayContaining([
        { flex: 1, textAlign: 'center' },
        { color: 'teamAText' },
      ]),
      variant: 'score',
    });
    expect(scoreChildren[1]?.props.style).toMatchObject({
      left: 0,
      position: 'absolute',
      right: 0,
      textAlign: 'center',
    });
    expect(scoreChildren[2]?.props).toMatchObject({
      accessibilityLabel: 'Team B, 3',
      style: expect.arrayContaining([
        { flex: 1, textAlign: 'center' },
        { color: 'teamBText' },
      ]),
      variant: 'score',
    });
    expect(columns?.type).toBe(MatchTeamColumns);
    expect(columns?.props.showLabels).toBe(false);
    expect(
      (columns?.props.teamAPlayers as MatchDetail['participants']['going']).map(
        ({ id }) => id,
      ),
    ).toEqual([ids.playerA, ids.playerB]);
    expect(
      (columns?.props.teamBPlayers as MatchDetail['participants']['going']).map(
        ({ id }) => id,
      ),
    ).toEqual([ids.playerC, ids.playerD]);
    const goals = columns?.props.goalsByPlayerId as ReadonlyMap<string, number>;
    expect(goals.get(ids.playerA)).toBe(4);
    expect(goals.get(ids.playerC)).toBe(3);
    expect(textValues(card)).not.toContain('Team A');
    expect(textValues(card)).not.toContain('Team B');
    expect(textValues(card)).not.toContain('Result');
  });

  it('uses the same player tile for pre-match and finished teams, adding only secondary goals', () => {
    const match = resultMatch();
    const teamAPlayers = match.teams?.find(({ side }) => side === 'A')?.players;
    const teamBPlayers = match.teams?.find(({ side }) => side === 'B')?.players;
    if (!teamAPlayers || !teamBPlayers)
      throw new Error('Expected final teams.');

    const preMatchColumns = MatchTeamColumns({
      teamAPlayers,
      teamBPlayers,
    }) as TestElement;
    const finishedColumns = MatchTeamColumns({
      goalsByPlayerId: new Map([
        [ids.playerA, 4],
        [ids.playerB, 1],
      ]),
      showLabels: false,
      teamAPlayers,
      teamBPlayers,
    }) as TestElement;
    const preMatchTeamA = renderFunctionElement(
      directChildren(preMatchColumns)[0] as TestElement,
    );
    const finishedTeamA = renderFunctionElement(
      directChildren(finishedColumns)[0] as TestElement,
    );
    const preMatchTile = playerTile(preMatchTeamA);
    const finishedTile = playerTile(finishedTeamA);

    expect(finishedTile.props.style).toEqual(preMatchTile.props.style);
    expect(directChildren(finishedTile)[0]?.props).toEqual(
      directChildren(preMatchTile)[0]?.props,
    );
    const preMatchDetails = directChildren(preMatchTile)[1] as TestElement;
    const finishedDetails = directChildren(finishedTile)[1] as TestElement;
    const [preMatchName] = directChildren(preMatchDetails);
    const [finishedName, finishedGoals] = directChildren(finishedDetails);

    expect(finishedDetails.props.style).toEqual(preMatchDetails.props.style);
    expect(finishedName?.props.children).toBe(preMatchName?.props.children);
    expect(preMatchName?.props.numberOfLines).toBe(2);
    expect(finishedName?.props.numberOfLines).toBe(1);
    expect(finishedGoals?.props).toMatchObject({
      children: '4 goals',
      numberOfLines: 1,
      tone: 'muted',
      variant: 'caption',
    });

    const finishedTeamB = renderFunctionElement(
      directChildren(finishedColumns)[1] as TestElement,
    );
    const zeroGoalTile = playerTiles(finishedTeamB)[1] as TestElement;
    const zeroGoalDetails = directChildren(zeroGoalTile)[1] as TestElement;
    expect(directChildren(zeroGoalDetails)[1]?.props.children).toBe('0 goals');
    expect(
      descendants(finishedTeamA).some(({ type }) =>
        ['Button', 'Pressable'].includes(String(type)),
      ),
    ).toBe(false);
  });
});

function resultMatch(): MatchDetail {
  const match = finishedMatch({ teamA: 5, teamB: 3 });
  if (!match.result) throw new Error('Expected finished result.');
  match.result.playerGoals = [
    { playerId: ids.playerA, goals: 4 },
    { playerId: ids.playerB, goals: 1 },
    { playerId: ids.playerC, goals: 3 },
    { playerId: ids.playerD, goals: 0 },
  ];
  return match;
}

function playerTile(column: TestElement): TestElement {
  const tile = playerTiles(column)[0];
  if (!tile) throw new Error('Expected a shared team player tile.');
  return tile;
}

function playerTiles(column: TestElement): TestElement[] {
  return directChildren(column).filter(
    (element) =>
      element.type === 'View' &&
      directChildren(element).some(({ type }) => type === 'Avatar'),
  );
}

function renderFunctionElement(element: TestElement): TestElement {
  if (typeof element.type !== 'function') {
    throw new Error('Expected a function component element.');
  }
  return (element.type as (props: TestElement['props']) => ReactNode)(
    element.props,
  ) as TestElement;
}

function descendants(element: TestElement): TestElement[] {
  return directChildren(element).flatMap((child) => [
    child,
    ...descendants(child),
  ]);
}

function directChildren(element: TestElement): TestElement[] {
  return Children.toArray(element.props.children).filter(
    (child): child is TestElement => isValidElement(child),
  );
}

function textValues(element: TestElement): unknown[] {
  return descendants(element).map(textValue);
}

function textValue(element: TestElement): unknown {
  return element.props.children;
}
