import { describe, expect, it } from 'vitest';

import { ApiClientError } from '../api/authenticated-api-client';
import { formatMatchDate } from '../matches/match-flow';
import { i18n } from './i18n';
import { localizedErrorMessage } from './localized-error';
import { resources } from './resources';

describe('mobile localization', () => {
  it('contains representative core navigation strings in English and Czech', () => {
    expect(resources.en.translation.nav.settings).toBe('Settings');
    expect(resources.cs.translation.nav.settings).toBe('Nastavení');
    expect(resources.en.translation.nav.rankings).toBe('Rankings');
    expect(resources.cs.translation.nav.rankings).toBe('Žebříčky');
    expect(resources.en.translation.ranking.title).toBe('Rankings');
    expect(resources.cs.translation.ranking.title).toBe('Žebříčky');
    expect(resources.en.translation.playerDetail.title).toBe('Player Profile');
    expect(resources.cs.translation.playerDetail.title).toBe('Profil hráče');
    expect(
      i18n.getFixedT('en')('ranking.participationSummary', {
        played: 17,
        total: 20,
      }),
    ).toBe('17 of 20');
    expect(
      i18n.getFixedT('cs')('ranking.participationSummary', {
        played: 17,
        total: 20,
      }),
    ).toBe('17 z 20');
    expect(resources.en.translation.account.signOut).toBe('Sign out');
    expect(resources.cs.translation.account.signOut).toBe('Odhlásit se');
    expect(resources.en.translation.settings.theme).toBe('Theme');
    expect(resources.cs.translation.settings.theme).toBe('Motiv');
    expect(resources.en.translation.settings.language).toBe('Language');
    expect(resources.cs.translation.settings.language).toBe('Jazyk');
    expect('intro' in resources.en.translation.settings).toBe(false);
    expect('intro' in resources.cs.translation.settings).toBe(false);
    expect(resources.en.translation.teams.regenerate).toBe('Regenerate');
    expect(resources.cs.translation.teams.regenerate).toBe('Přegenerovat');
    expect(resources.en.translation.teams.edit).toBe('Edit');
    expect(resources.cs.translation.teams.edit).toBe('Upravit');
    expect(resources.en.translation.guest.add).toBe('Add guest');
    expect(resources.cs.translation.guest.add).toBe('Přidat hosta');
    expect(resources.en.translation.teams.start).toBe('Start match');
    expect(resources.cs.translation.teams.start).toBe('Spustit zápas');
    expect(resources.en.translation.teams.lockTitle).toBe('Start match?');
    expect(resources.cs.translation.teams.lockTitle).toBe('Spustit zápas?');
    expect(resources.en.translation.teams.lockHint).toBe(
      'After starting, attendance and teams can no longer be changed. Scoring is started separately.',
    );
    expect(resources.cs.translation.teams.lockHint).toBe(
      'Po spuštění už nepůjde měnit účast ani týmy. Skórování spustíš samostatně.',
    );
    expect(resources.en.translation.teams.keepEditing).toBe('Keep editing');
    expect(resources.cs.translation.teams.keepEditing).toBe('Ještě upravit');
    expect(resources.en.translation.match.finish).toBe('Finish Match');
    expect(resources.cs.translation.match.finish).toBe('Dokončit zápas');
    expect(resources.en.translation.match.submitResult).toBe('Finish match?');
    expect(resources.cs.translation.match.submitResult).toBe('Dokončit zápas?');
    expect(resources.en.translation.match.continueMatch).toBe('Continue match');
    expect(resources.cs.translation.match.continueMatch).toBe(
      'Pokračovat v zápase',
    );
    expect(resources.en.translation.match.confirmFinish).toBe('Confirm result');
    expect(resources.cs.translation.match.confirmFinish).toBe(
      'Potvrdit výsledek',
    );
    expect(
      i18n.getFixedT('en')('match.authoritativeResult', {
        teamA: 5,
        teamB: 3,
      }),
    ).toBe(
      'The 5–3 score will be saved as the final result and can no longer be changed.',
    );
    expect(
      i18n.getFixedT('cs')('match.authoritativeResult', {
        teamA: 5,
        teamB: 3,
      }),
    ).toBe('Výsledek 5:3 se uloží jako konečný a už ho nepůjde upravit.');
    expect(resources.en.translation.cancellation.title).toBe('Cancel match');
    expect(resources.cs.translation.cancellation.title).toBe('Zrušit zápas');
    expect(resources.en.translation.attendance.editParticipantsAction).toBe(
      'Edit',
    );
    expect(resources.cs.translation.attendance.editParticipantsAction).toBe(
      'Upravit',
    );
    expect(resources.en.translation.attendance.editParticipants).toBe(
      'Edit participants',
    );
    expect(resources.cs.translation.attendance.editParticipants).toBe(
      'Upravit účastníky',
    );
    expect(resources.en.translation.teams.editTitle).toBe('Edit teams');
    expect(resources.cs.translation.teams.editTitle).toBe('Upravit týmy');
    expect(
      sortedTranslationKeys(resources.cs.translation).filter(
        (key) => !key.endsWith('_few'),
      ),
    ).toEqual(sortedTranslationKeys(resources.en.translation));
  });

  it('maps API error codes instead of rendering backend messages', () => {
    const error = new ApiClientError(
      409,
      'MATCH_ALREADY_FINISHED',
      'server text',
    );
    const english = i18n.getFixedT('en');
    const czech = i18n.getFixedT('cs');
    expect(localizedErrorMessage(error, english)).toBe(
      'This Match has already been finished.',
    );
    expect(localizedErrorMessage(error, czech)).toBe(
      'Tento zápas už byl dokončen.',
    );
  });

  it('uses the Czech recent-wins ratio and recent-match plural forms', () => {
    const czech = i18n.getFixedT('cs');

    expect(czech('playerDetail.recentWinsValue', { matches: 5, wins: 3 })).toBe(
      '3 z 5',
    );
    expect(czech('playerDetail.recentWinsMatches', { count: 1 })).toBe(
      'Poslední 1 zápas',
    );
    expect(czech('playerDetail.recentWinsMatches', { count: 3 })).toBe(
      'Poslední 3 zápasy',
    );
    expect(czech('playerDetail.recentWinsMatches', { count: 5 })).toBe(
      'Posledních 5 zápasů',
    );
    expect(
      czech('playerDetail.recentWinsAccessibility', {
        matches: 3,
        results: 'Prohra, Remíza, Výhra',
        wins: 1,
      }),
    ).toBe(
      'Výhry: 1 z 3 posledních dokončených zápasů. Od nejstaršího po nejnovější: Prohra, Remíza, Výhra.',
    );
  });

  it('uses the concise goal-history heading without changing its data scope', () => {
    expect(resources.en.translation.playerDetail.goalsChartTitle).toBe(
      'Goals in recent matches',
    );
    expect(resources.cs.translation.playerDetail.goalsChartTitle).toBe(
      'Góly v posledních zápasech',
    );
  });

  it('localizes invitation delivery and identity conflicts without provider terminology', () => {
    const english = i18n.getFixedT('en');
    const czech = i18n.getFixedT('cs');
    expect(
      localizedErrorMessage(
        new ApiClientError(
          503,
          'INVITATION_DELIVERY_FAILED',
          'private provider detail',
        ),
        english,
      ),
    ).toContain('safe to try again');
    expect(
      localizedErrorMessage(
        new ApiClientError(
          409,
          'INVITATION_IDENTITY_ALREADY_LINKED',
          'private provider detail',
        ),
        czech,
      ),
    ).toContain('jiným hráčem');
    expect(resources.en.translation.adminPlayer.inviteAsUser).not.toContain(
      'Firebase',
    );
    expect(resources.cs.translation.adminPlayer.inviteAsUser).not.toContain(
      'Firebase',
    );
  });

  it('formats Prague Match dates with the selected locale', () => {
    const value = '2026-09-08T16:00:00.000Z';
    expect(formatMatchDate(value, 'en')).not.toBe(formatMatchDate(value, 'cs'));
  });

  it('formats participant group counts in English and Czech', () => {
    const english = i18n.getFixedT('en');
    const czech = i18n.getFixedT('cs');

    expect(
      english('attendance.groupCount', {
        count: 0,
        label: english('attendance.going'),
      }),
    ).toBe('Going (0)');
    expect(
      english('attendance.groupCount', {
        count: 2,
        label: english('attendance.notGoing'),
      }),
    ).toBe('Not going (2)');
    expect(
      czech('attendance.groupCount', {
        count: 0,
        label: czech('attendance.going'),
      }),
    ).toBe('Jdu (0)');
    expect(
      czech('attendance.groupCount', {
        count: 2,
        label: czech('attendance.notGoing'),
      }),
    ).toBe('Nejdu (2)');
  });

  it('localizes ranking criteria', () => {
    const english = i18n.getFixedT('en');
    const czech = i18n.getFixedT('cs');

    expect(english('ranking.criteria.winRate')).toBe('Win rate');
    expect(english('ranking.criteria.goalsPerMatch')).toBe('Goals/match');
    expect(english('ranking.criteria.participation')).toBe('Participation');
    expect(czech('ranking.criteria.winRate')).toBe('Úspěšnost');
    expect(czech('ranking.criteria.goalsPerMatch')).toBe('Góly/zápas');
    expect(czech('ranking.criteria.participation')).toBe('Účast');
  });

  it('pluralizes the selected Player finished-Match count in Czech', () => {
    const czech = i18n.getFixedT('cs');

    expect(czech('playerDetail.playedMatches', { count: 1 })).toBe(
      '1 odehraný zápas',
    );
    expect(czech('playerDetail.playedMatches', { count: 3 })).toBe(
      '3 odehrané zápasy',
    );
    expect(czech('playerDetail.playedMatches', { count: 17 })).toBe(
      '17 odehraných zápasů',
    );
  });
});

function sortedTranslationKeys(
  value: Readonly<Record<string, unknown>>,
  prefix = '',
): string[] {
  return Object.entries(value)
    .flatMap(([key, nestedValue]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return typeof nestedValue === 'object' && nestedValue !== null
        ? sortedTranslationKeys(
            nestedValue as Readonly<Record<string, unknown>>,
            path,
          )
        : [path];
    })
    .sort();
}
