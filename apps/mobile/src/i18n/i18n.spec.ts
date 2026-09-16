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
    expect(resources.en.translation.account.signOut).toBe('Sign out');
    expect(resources.cs.translation.account.signOut).toBe('Odhlásit se');
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
