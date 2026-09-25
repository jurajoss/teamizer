import type { AndroidSymbol, SFSymbol } from 'expo-symbols';

export const teamizerIconNames = [
  'home',
  'matches',
  'players',
  'statistics',
  'back',
  'account',
  'settings',
  'administration',
  'logout',
  'remove',
  'complete',
] as const;

export type TeamizerIconName = (typeof teamizerIconNames)[number];

type TeamizerPlatformSymbol = {
  ios: SFSymbol;
  android: AndroidSymbol;
  web: AndroidSymbol;
};

export const teamizerIconSymbols: Record<
  TeamizerIconName,
  TeamizerPlatformSymbol
> = {
  home: { ios: 'house.fill', android: 'home', web: 'home' },
  matches: {
    ios: 'calendar',
    android: 'calendar_month',
    web: 'calendar_month',
  },
  players: { ios: 'person.3.fill', android: 'groups', web: 'groups' },
  statistics: {
    ios: 'chart.bar.fill',
    android: 'leaderboard',
    web: 'leaderboard',
  },
  back: { ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' },
  account: {
    ios: 'person.crop.circle',
    android: 'account_circle',
    web: 'account_circle',
  },
  settings: { ios: 'gearshape', android: 'settings', web: 'settings' },
  administration: {
    ios: 'shield.lefthalf.filled',
    android: 'admin_panel_settings',
    web: 'admin_panel_settings',
  },
  logout: {
    ios: 'rectangle.portrait.and.arrow.right',
    android: 'logout',
    web: 'logout',
  },
  remove: { ios: 'minus', android: 'remove', web: 'remove' },
  complete: { ios: 'checkmark', android: 'check', web: 'check' },
};
