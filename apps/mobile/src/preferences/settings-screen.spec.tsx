import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const preferences = vi.hoisted(() => ({
  language: 'cs' as const,
  setLanguage: vi.fn(),
  setThemePreference: vi.fn(),
  themePreference: 'system' as const,
}));

vi.mock('react-native', () => ({
  StyleSheet: { create: <T,>(styles: T) => styles },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'settings.language': 'Jazyk',
        'settings.languageCzech': 'Čeština',
        'settings.languageEnglish': 'English',
        'settings.theme': 'Motiv',
        'settings.themeDark': 'Tmavý',
        'settings.themeLight': 'Světlý',
        'settings.themeSystem': 'Podle systému',
      })[key] ?? key,
  }),
}));
vi.mock('@teamizer/ui', () => ({
  AppText: 'AppText',
  Card: 'Card',
  spacing: { md: 16, sm: 12 },
}));
vi.mock('../ui/app-screen', () => ({ AppScreen: 'AppScreen' }));
vi.mock('../ui/segmented-control', () => ({
  SegmentedControl: 'SegmentedControl',
}));
vi.mock('./preferences-context', () => ({
  usePreferences: () => preferences,
}));

import { SettingsScreen } from './settings-screen';

type TestElement = ReactElement<{
  [key: string]: unknown;
  children?: ReactNode;
}>;

describe('Settings screen presentation', () => {
  beforeEach(() => {
    preferences.setLanguage.mockReset();
    preferences.setThemePreference.mockReset();
  });

  it('renders exactly the compact Theme and Language cards', () => {
    const screen = SettingsScreen() as TestElement;
    const cards = descendants(screen).filter(({ type }) => type === 'Card');

    expect(cards).toHaveLength(2);
    expect(cards.map(({ props }) => props.padding)).toEqual([
      'compact',
      'compact',
    ]);
    expect(textValues(screen)).toEqual(['Motiv', 'Jazyk']);
    expect(textValues(screen)).not.toEqual(
      expect.arrayContaining([
        'VZHLED',
        'Zvolte vzhled a jazyk Teamizeru na tomto zařízení.',
        'Systémový motiv se řídí nastavením zařízení.',
        'Texty aplikace a datumy používají zvolený jazyk.',
      ]),
    );
  });

  it('uses the established card-heading typography for both card titles', () => {
    const screen = SettingsScreen() as TestElement;
    const headings = descendants(screen).filter(
      ({ props, type }) =>
        type === 'AppText' && props.accessibilityRole === 'header',
    );

    expect(headings).toHaveLength(2);
    expect(headings.map(({ props }) => props.variant)).toEqual([
      'heading',
      'heading',
    ]);
  });

  it('offers the localized theme and language options with current selections', () => {
    const screen = SettingsScreen() as TestElement;
    const controls = descendants(screen).filter(
      ({ type }) => type === 'SegmentedControl',
    );

    expect(controls).toHaveLength(2);
    expect(controls[0]?.props).toMatchObject({
      accessibilityLabel: 'Motiv',
      items: [
        { label: 'Podle systému', value: 'system' },
        { label: 'Světlý', value: 'light' },
        { label: 'Tmavý', value: 'dark' },
      ],
      value: 'system',
    });
    expect(controls[1]?.props).toMatchObject({
      accessibilityLabel: 'Jazyk',
      items: [
        { label: 'Čeština', value: 'cs' },
        { label: 'English', value: 'en' },
      ],
      value: 'cs',
    });
  });

  it('keeps immediate theme and language preference updates', () => {
    const screen = SettingsScreen() as TestElement;
    const controls = descendants(screen).filter(
      ({ type }) => type === 'SegmentedControl',
    );

    invoke(controls[0]?.props.onChange, 'dark');
    invoke(controls[1]?.props.onChange, 'en');
    expect(preferences.setThemePreference).toHaveBeenCalledOnce();
    expect(preferences.setThemePreference).toHaveBeenCalledWith('dark');
    expect(preferences.setLanguage).toHaveBeenCalledOnce();
    expect(preferences.setLanguage).toHaveBeenCalledWith('en');
  });
});

function descendants(node: ReactNode): TestElement[] {
  if (!isValidElement(node)) return [];
  const element = node as TestElement;
  return [
    element,
    ...Children.toArray(element.props.children).flatMap(descendants),
  ];
}

function textValues(node: ReactNode): string[] {
  if (typeof node === 'string') return [node];
  if (!isValidElement(node)) return [];
  return Children.toArray((node as TestElement).props.children).flatMap(
    textValues,
  );
}

function invoke(handler: unknown, value: string) {
  if (typeof handler === 'function') handler(value);
}
